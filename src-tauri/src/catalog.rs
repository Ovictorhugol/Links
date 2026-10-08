use atomic_write_file::AtomicWriteFile;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MAX_CATALOG: usize = 8 * 1024 * 1024;
const MAX_ICON: usize = 512 * 1024;
const BUNDLED_CONFIG: &str = include_str!(concat!(env!("OUT_DIR"), "/client-config.json"));

#[derive(Clone, Deserialize, Serialize)]
pub struct Link {
    id: String,
    name: String,
    description: String,
    url: String,
    category: String,
    logo: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Catalog {
    version: u64,
    #[serde(
        default,
        rename = "displayVersion",
        skip_serializing_if = "Option::is_none"
    )]
    display_version: Option<u64>,
    links: Vec<Link>,
    #[serde(
        default,
        rename = "categoryIcons",
        skip_serializing_if = "HashMap::is_empty"
    )]
    category_icons: HashMap<String, String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    source: Source,
    catalog_url: Option<String>,
    poll_interval_minutes: u64,
    #[serde(default, skip_serializing)]
    postgres: Option<PostgresConfig>,
}
#[derive(Clone, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Source {
    #[default]
    Https,
    Postgres,
}
#[derive(Clone, Deserialize)]
struct PostgresConfig {
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    catalog: Catalog,
    last_sync: Option<u64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCatalog {
    snapshot: Snapshot,
    config: Config,
    warning: Option<String>,
}

fn fallback() -> Snapshot {
    Snapshot {
        catalog: serde_json::from_str(include_str!("../../src/catalog.initial.json"))
            .expect("Catálogo inicial inválido"),
        last_sync: None,
    }
}
fn cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("catalog-cache.json"))
        .map_err(|e| e.to_string())
}
fn config() -> Result<Config, String> {
    let path = PathBuf::from(std::env::var_os("PROGRAMDATA").ok_or("PROGRAMDATA indisponível")?)
        .join("DonatoLinks")
        .join("client-config.json");
    let contents = match fs::read_to_string(path) {
        Ok(contents) => Some(contents),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Não foi possível ler a configuração: {e}")),
    };
    parse_config(contents.as_deref(), BUNDLED_CONFIG)
}
fn parse_config(contents: Option<&str>, bundled: &str) -> Result<Config, String> {
    let mut settings: Config = serde_json::from_str(contents.unwrap_or(bundled))
        .map_err(|e| format!("Configuração inválida: {e}"))?;
    // Old GPOs may have copied the empty template. It must not disable the packaged connection.
    if contents.is_some() && settings.source == Source::Https && settings.catalog_url.is_none() {
        settings = serde_json::from_str(bundled)
            .map_err(|e| format!("Configuração inicial inválida: {e}"))?;
    }
    if !(1..=1440).contains(&settings.poll_interval_minutes) {
        return Err("Intervalo deve estar entre 1 e 1440 minutos".into());
    }
    if settings.source == Source::Postgres {
        let database = settings
            .postgres
            .as_ref()
            .ok_or("Configuração PostgreSQL ausente")?;
        if database.host.is_empty()
            || database.host.len() > 253
            || !database
                .host
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
            || database.port == 0
            || database.database.is_empty()
            || database.database.len() > 63
            || database.user != "donato_links_reader"
            || database.password.is_empty()
        {
            return Err(
                "Configure o host, banco e credencial do usuário donato_links_reader".into(),
            );
        }
    }
    if let Some(url) = &settings.catalog_url {
        let parsed = reqwest::Url::parse(url).map_err(|_| "URL do catálogo inválida")?;
        if parsed.scheme() != "https"
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("O catálogo deve usar HTTPS, sem credenciais no endereço".into());
        }
    }
    Ok(settings)
}
fn validate_icon(logo: &str) -> Result<(), String> {
    if logo.starts_with("https://") {
        let url = reqwest::Url::parse(logo).map_err(|_| "URL de ícone inválida")?;
        if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
            return Err("URL de ícone inválida".into());
        }
    } else if logo.starts_with("data:image/") {
        let (header, bytes) = logo.split_once(',').ok_or("Ícone inválido")?;
        if ![
            "data:image/png;base64",
            "data:image/jpeg;base64",
            "data:image/webp;base64",
            "data:image/x-icon;base64",
        ]
        .contains(&header)
            || STANDARD.decode(bytes).map_err(|_| "Ícone inválido")?.len() > MAX_ICON
        {
            return Err("Ícone inválido ou muito grande".into());
        }
    } else if logo != "/donato-eye.svg"
        && !fallback()
            .catalog
            .links
            .iter()
            .any(|item| item.logo == logo)
    {
        return Err("Ícone local desconhecido. Use um ícone embutido ou uma URL HTTPS".into());
    }
    Ok(())
}

fn validate(catalog: &Catalog) -> Result<(), String> {
    if catalog.version == 0
        || catalog.version > 9_007_199_254_740_991
        || catalog
            .display_version
            .is_some_and(|version| version > catalog.version)
        || catalog.links.is_empty()
        || catalog.links.len() > 500
    {
        return Err("Versão ou quantidade de links inválida".into());
    }
    if catalog.category_icons.len() > 501 {
        return Err("Too many category icons".into());
    }
    for (name, logo) in &catalog.category_icons {
        if name.trim().is_empty()
            || name.len() > 4096
            || ["__proto__", "constructor", "prototype"].contains(&name.as_str())
        {
            return Err("Invalid category name".into());
        }
        validate_icon(logo)?;
    }
    let mut ids = HashSet::new();
    for link in &catalog.links {
        if link.id.is_empty()
            || link.id.len() > 64
            || !link
                .id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
            || !link.id.as_bytes()[0].is_ascii_alphanumeric()
            || !ids.insert(&link.id)
        {
            return Err("ID inválido ou duplicado".into());
        }
        if link.name.trim().is_empty()
            || link.category.trim().is_empty()
            || link.category == "Todos"
            || [&link.name, &link.description, &link.category, &link.url]
                .iter()
                .any(|s| s.len() > 4096)
        {
            return Err("Nome, categoria ou tamanho de campo inválido".into());
        }
        let url = reqwest::Url::parse(&link.url).map_err(|_| "URL inválida")?;
        match url.scheme() {
            "http" | "https"
                if url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none() => {}
            "file" => {
                file_path(&url)?;
            }
            _ => {
                return Err(
                    "Use um site HTTP/HTTPS ou um caminho completo de arquivo ou pasta".into(),
                )
            }
        }
        validate_icon(&link.logo)?;
    }
    Ok(())
}
fn load(app: &tauri::AppHandle) -> Result<Snapshot, String> {
    let path = cache_path(app)?;
    read_snapshot(&path)
}
fn file_path(url: &reqwest::Url) -> Result<PathBuf, String> {
    if url.scheme() != "file"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Endereço de arquivo inválido".into());
    }
    if let Some(host) = url.host_str() {
        if !host
            .as_bytes()
            .first()
            .is_some_and(|c| c.is_ascii_alphanumeric())
            || !host
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
        {
            return Err("Servidor de arquivos inválido".into());
        }
    }
    let path = url
        .to_file_path()
        .map_err(|_| "Caminho de arquivo inválido")?;
    if !path.is_absolute() || path.to_string_lossy().chars().any(char::is_control) {
        return Err("Informe um caminho absoluto de arquivo ou pasta".into());
    }
    #[cfg(windows)]
    if !matches!(path.components().next(), Some(std::path::Component::Prefix(prefix))
        if matches!(prefix.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::UNC(_, _)))
    {
        return Err("Use uma unidade Windows ou compartilhamento UNC".into());
    }
    Ok(path)
}
fn catalog_file(catalog: &Catalog, id: &str) -> Result<PathBuf, String> {
    let link = catalog
        .links
        .iter()
        .find(|link| link.id == id)
        .ok_or("Atalho não encontrado no catálogo local")?;
    let url = reqwest::Url::parse(&link.url).map_err(|_| "Endereço inválido")?;
    file_path(&url)
}
#[tauri::command]
pub async fn open_catalog_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let snapshot = read_snapshot(&cache_path(&app)?).unwrap_or_else(|_| fallback());
    let path = catalog_file(&snapshot.catalog, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
fn read_snapshot(path: &Path) -> Result<Snapshot, String> {
    if !path.exists() {
        return Ok(fallback());
    }
    let data = fs::read(path).map_err(|e| e.to_string())?;
    if data.len() > MAX_CATALOG {
        return Err("Cache muito grande".into());
    }
    let snapshot: Snapshot = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    validate(&snapshot.catalog)?;
    if snapshot.catalog.version < fallback().catalog.version {
        return Ok(fallback());
    }
    Ok(snapshot)
}
#[tauri::command]
pub fn load_catalog(app: tauri::AppHandle) -> LocalCatalog {
    let mut warning = None;
    let snapshot = load(&app).unwrap_or_else(|e| {
        warning = Some(format!("Cache indisponível; usando catálogo inicial. {e}"));
        fallback()
    });
    let config = config().unwrap_or_else(|e| {
        warning = Some(e);
        Config {
            source: Source::Https,
            catalog_url: None,
            poll_interval_minutes: 60,
            postgres: None,
        }
    });
    LocalCatalog {
        snapshot,
        config,
        warning,
    }
}
async fn download(
    client: &reqwest::Client,
    url: &str,
    max: usize,
) -> Result<(Vec<u8>, String), String> {
    let mut response = client
        .get(url)
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|s| s.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_owned();
    if response
        .content_length()
        .is_some_and(|len| len > max as u64)
    {
        return Err("Resposta muito grande".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if data.len() + chunk.len() > max {
            return Err("Resposta muito grande".into());
        }
        data.extend_from_slice(&chunk);
    }
    Ok((data, content_type))
}
#[tauri::command]
pub async fn sync_catalog(app: tauri::AppHandle) -> Result<Snapshot, String> {
    let settings = config()?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut catalog: Catalog = if settings.source == Source::Postgres {
        postgres_catalog(
            settings
                .postgres
                .as_ref()
                .ok_or("Configuração PostgreSQL ausente")?,
        )
        .await?
    } else {
        let url = settings
            .catalog_url
            .ok_or("Configure o endereço do catálogo em client-config.json")?;
        let (data, _) = download(&client, &url, MAX_CATALOG).await?;
        serde_json::from_slice(&data).map_err(|e| format!("Catálogo inválido: {e}"))?
    };
    validate(&catalog)?;
    let current = load(&app).unwrap_or_else(|_| fallback());
    if catalog.version < current.catalog.version {
        return Err("Servidor retornou uma versão anterior; mantendo os links locais".into());
    }
    // Each downloaded icon becomes part of the same offline snapshot.
    for link in &mut catalog.links {
        if link.logo.starts_with("https://") {
            let downloaded = download(&client, &link.logo, MAX_ICON).await;
            link.logo = match downloaded {
                Ok((data, mime))
                    if [
                        "image/png",
                        "image/jpeg",
                        "image/webp",
                        "image/x-icon",
                        "image/vnd.microsoft.icon",
                    ]
                    .contains(&mime.as_str()) =>
                {
                    let mime = if mime == "image/vnd.microsoft.icon" {
                        "image/x-icon"
                    } else {
                        &mime
                    };
                    format!("data:{mime};base64,{}", STANDARD.encode(data))
                }
                _ => current
                    .catalog
                    .links
                    .iter()
                    .find(|item| item.id == link.id && !item.logo.starts_with("https://"))
                    .map(|item| item.logo.clone())
                    .unwrap_or_else(|| "/donato-eye.svg".into()),
            };
        }
    }
    for (name, logo) in &mut catalog.category_icons {
        if logo.starts_with("https://") {
            *logo = match download(&client, logo, MAX_ICON).await {
                Ok((data, mime))
                    if [
                        "image/png",
                        "image/jpeg",
                        "image/webp",
                        "image/x-icon",
                        "image/vnd.microsoft.icon",
                    ]
                    .contains(&mime.as_str()) =>
                {
                    let mime = if mime == "image/vnd.microsoft.icon" {
                        "image/x-icon"
                    } else {
                        &mime
                    };
                    format!("data:{mime};base64,{}", STANDARD.encode(data))
                }
                _ => current
                    .catalog
                    .category_icons
                    .get(name)
                    .filter(|icon| !icon.starts_with("https://"))
                    .cloned()
                    .unwrap_or_else(|| "/donato-eye.svg".into()),
            };
        }
    }
    let snapshot = Snapshot {
        catalog,
        last_sync: Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs(),
        ),
    };
    save_snapshot(&cache_path(&app)?, &snapshot)?;
    Ok(snapshot)
}
fn save_snapshot(path: &Path, snapshot: &Snapshot) -> Result<(), String> {
    validate(&snapshot.catalog)?;
    let data = serde_json::to_vec(snapshot).map_err(|e| e.to_string())?;
    if data.len() > MAX_CATALOG {
        return Err("Catálogo com ícones excede 8 MB; reduza as imagens".into());
    }
    fs::create_dir_all(path.parent().ok_or("Diretório inválido")?).map_err(|e| e.to_string())?;
    let mut file = AtomicWriteFile::open(path).map_err(|e| e.to_string())?;
    file.write_all(&data).map_err(|e| e.to_string())?;
    file.commit()
        .map_err(|e| format!("Não foi possível salvar os links; mantendo a cópia anterior: {e}"))?;
    Ok(())
}

async fn postgres_catalog(settings: &PostgresConfig) -> Result<Catalog, String> {
    let work = async {
        let mut tls = native_tls::TlsConnector::builder();
        // The same official RDS roots used by the backend are included in the executable.
        for part in include_str!("../../deployment/certificates/global-bundle.pem")
            .split("-----END CERTIFICATE-----")
        {
            if let Some(start) = part.find("-----BEGIN CERTIFICATE-----") {
                let pem = format!("{}-----END CERTIFICATE-----", &part[start..]);
                tls.add_root_certificate(
                    native_tls::Certificate::from_pem(pem.as_bytes()).map_err(|e| e.to_string())?,
                );
            }
        }
        let tls =
            postgres_native_tls::MakeTlsConnector::new(tls.build().map_err(|e| e.to_string())?);
        let mut connection_settings = tokio_postgres::Config::new();
        connection_settings
            .host(&settings.host)
            .port(settings.port)
            .dbname(&settings.database)
            .user(&settings.user)
            .password(&settings.password)
            .application_name("DonatoLinksDesktop")
            .ssl_mode(tokio_postgres::config::SslMode::Require)
            .connect_timeout(Duration::from_secs(10))
            .options("-c default_transaction_read_only=on -c statement_timeout=10000");
        let (client, connection) = connection_settings
            .connect(tls)
            .await
            .map_err(|e| format!("Não foi possível conectar ao RDS: {e}"))?;
        tokio::pin!(connection);
        let row = tokio::select! {
            result = client.query_one("SELECT catalog_json FROM donato_links.published_catalog", &[]) => result.map_err(|e| format!("Não foi possível ler o catálogo publicado: {e}"))?,
            result = &mut connection => return Err(format!("Conexão RDS encerrada: {}", result.err().map(|e| e.to_string()).unwrap_or_default())),
        };
        let data: String = row.try_get(0).map_err(|e| e.to_string())?;
        if data.len() > MAX_CATALOG {
            return Err("Catálogo RDS excede 8 MB".into());
        }
        let catalog: Catalog =
            serde_json::from_str(&data).map_err(|e| format!("Catálogo RDS inválido: {e}"))?;
        validate(&catalog)?;
        Ok(catalog)
    };
    tokio::time::timeout(Duration::from_secs(15), work)
        .await
        .map_err(|_| {
            "Consulta ao RDS excedeu o tempo limite; mantendo os links locais".to_string()
        })?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn display_version_zero_survives_native_serialization_and_cache() {
        let mut snapshot = fallback();
        assert!(snapshot.catalog.display_version.is_none());
        snapshot.catalog.version = 32;
        snapshot.catalog.display_version = Some(0);
        assert!(validate(&snapshot.catalog).is_ok());
        let json = serde_json::to_value(&snapshot).unwrap();
        assert_eq!(json["catalog"]["version"], 32);
        assert_eq!(json["catalog"]["displayVersion"], 0);
        let cached: Snapshot = serde_json::from_value(json).unwrap();
        assert_eq!(cached.catalog.display_version, Some(0));
        assert_eq!(cached.catalog.version, 32);
        snapshot.catalog.display_version = Some(33);
        assert!(validate(&snapshot.catalog).is_err());
    }
    #[test]
    fn category_icons_are_validated_and_preserved_in_snapshots() {
        let mut catalog = fallback().catalog;
        assert!(catalog.category_icons.is_empty());
        catalog
            .category_icons
            .insert("Todos".into(), "/donato-eye.svg".into());
        assert!(validate(&catalog).is_ok());
        let json = serde_json::to_value(&catalog).unwrap();
        assert_eq!(json["categoryIcons"]["Todos"], "/donato-eye.svg");
        let parsed: Catalog = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.category_icons["Todos"], "/donato-eye.svg");
        catalog
            .category_icons
            .insert("Todos".into(), "javascript:alert(1)".into());
        assert!(validate(&catalog).is_err());
    }
    #[test]
    #[cfg(windows)]
    fn shared_file_paths_are_decoded_and_only_catalog_items_can_be_opened() {
        let mut catalog = fallback().catalog;
        catalog.links[0].url =
            "file:///O:/GERAL/%C3%81REA%20DE%20TRANSFERENCIA/Lista%20Nova.xlsx".into();
        assert!(validate(&catalog).is_ok());
        assert_eq!(
            catalog_file(&catalog, "eaglesoft").unwrap(),
            PathBuf::from(r"O:\GERAL\ÁREA DE TRANSFERENCIA\Lista Nova.xlsx")
        );
        catalog.links[0].url =
            "file://servidor/GERAL/%C3%81rea%20da%20equipe/Lista%20%231.xlsx".into();
        assert!(validate(&catalog).is_ok());
        assert_eq!(
            catalog_file(&catalog, "eaglesoft").unwrap(),
            PathBuf::from(r"\\servidor\GERAL\Área da equipe\Lista #1.xlsx")
        );
        assert!(catalog_file(&catalog, "outside-catalog").is_err());
        assert!(catalog_file(&catalog, "onedrive").is_err());
        for url in [
            "file:///relative/file",
            "file:///O:/file%00.xlsx",
            "file://./share/file",
            "file:///O:/file.xlsx?command=x",
        ] {
            catalog.links[0].url = url.into();
            assert!(validate(&catalog).is_err(), "{url}");
        }
    }
    #[test]
    fn installation_without_gpo_configuration_uses_packaged_connection() {
        let bundled = r#"{"source":"postgres","catalogUrl":null,"pollIntervalMinutes":60,"postgres":{"host":"example.com","port":5432,"database":"linksdonato","user":"donato_links_reader","password":"test-reader-secret"}}"#;
        for local in [
            None,
            Some(r#"{"catalogUrl":null,"pollIntervalMinutes":60}"#),
        ] {
            let config = parse_config(local, bundled).unwrap();
            assert!(config.source == Source::Postgres);
            assert_eq!(config.poll_interval_minutes, 60);
            assert_eq!(config.postgres.unwrap().user, "donato_links_reader");
        }
        let override_config = parse_config(Some(r#"{"catalogUrl":"https://catalog.example.com/links.json","pollIntervalMinutes":30}"#), bundled).unwrap();
        assert!(override_config.source == Source::Https);
        assert_eq!(override_config.poll_interval_minutes, 30);
        assert!(parse_config(Some("{broken"), bundled).is_err());
    }
    #[test]
    fn credentials_are_not_returned_to_the_frontend() {
        let configuration: Config = serde_json::from_str(r#"{"source":"postgres","catalogUrl":null,"pollIntervalMinutes":60,"postgres":{"host":"example.com","port":5432,"database":"linksdonato","user":"donato_links_reader","password":"private-reader-secret"}}"#).unwrap();
        let serialized = serde_json::to_string(&configuration).unwrap();
        assert!(!serialized.contains("private-reader-secret"));
        assert!(!serialized.contains("\"postgres\":"));
    }
    #[test]
    #[ignore = "Connects to the configured RDS with the generated read-only account"]
    fn reads_published_catalog_directly_from_rds() {
        // Exercise the same default used on a machine installed by GPO without a separate config file.
        let configuration = parse_config(None, BUNDLED_CONFIG).unwrap();
        let catalog = tauri::async_runtime::block_on(postgres_catalog(
            configuration.postgres.as_ref().unwrap(),
        ))
        .unwrap();
        assert!(!catalog.links.is_empty());
        assert!(catalog.version >= 1);
    }
    #[test]
    fn validates_bundled_catalog_and_rejects_bad_inputs() {
        let mut catalog = fallback().catalog;
        assert!(validate(&catalog).is_ok());
        catalog.links.push(catalog.links[0].clone());
        assert!(validate(&catalog).is_err());
        catalog.links.pop();
        catalog.links[0].url = "javascript:alert(1)".into();
        assert!(validate(&catalog).is_err());
        catalog.links.clear();
        assert!(validate(&catalog).is_err());
    }
    #[test]
    fn persisted_catalog_survives_interrupted_and_invalid_updates() {
        let directory = std::env::temp_dir().join(format!(
            "donato-cache-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = directory.join("catalog-cache.json");
        let mut snapshot = fallback();
        snapshot.catalog.version = 2;
        snapshot.last_sync = Some(12345);
        save_snapshot(&path, &snapshot).unwrap();
        assert_eq!(read_snapshot(&path).unwrap().catalog.version, 2);
        // Dropping a partial replacement must leave the committed file intact on Windows.
        {
            let mut replacement = AtomicWriteFile::open(&path).unwrap();
            replacement.write_all(b"{incomplete").unwrap();
        }
        assert_eq!(read_snapshot(&path).unwrap().last_sync, Some(12345));
        snapshot.catalog.links.clear();
        assert!(save_snapshot(&path, &snapshot).is_err());
        assert_eq!(read_snapshot(&path).unwrap().catalog.version, 2);
        snapshot = fallback();
        snapshot.catalog.version = 3;
        save_snapshot(&path, &snapshot).unwrap();
        assert_eq!(read_snapshot(&path).unwrap().catalog.version, 3);
        fs::write(&path, b"{corrupted").unwrap();
        assert!(read_snapshot(&path).is_err());
        fs::remove_file(&path).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
