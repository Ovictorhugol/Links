fn main() {
    bundle_client_config();
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    let attributes = tauri_build::Attributes::new().windows_attributes(
        tauri_build::WindowsAttributes::new().window_icon_path("icons/icon.ico"),
    );
    tauri_build::try_build(attributes).expect("Não foi possível preparar o aplicativo Donato");
}

fn bundle_client_config() {
    use serde_json::{json, Value};
    use std::{env, fs, path::PathBuf};
    let project = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("..");
    let private = project.join("server/data/client-rds.json");
    let fallback = project.join("deployment/client-config.json");
    println!("cargo:rerun-if-changed={}", private.display());
    println!("cargo:rerun-if-changed={}", fallback.display());
    let contents = match fs::read_to_string(&private) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::read_to_string(&fallback).expect("Não foi possível ler a configuração inicial")
        }
        Err(_) => panic!("Não foi possível ler a configuração privada do leitor"),
    };
    let config: Value = serde_json::from_str(&contents).expect("Configuração inicial inválida");
    let interval = config["pollIntervalMinutes"]
        .as_u64()
        .filter(|n| (1..=1440).contains(n))
        .expect("Intervalo de sincronização inválido");
    let bundled = if config["source"] == "postgres" {
        let pg = &config["postgres"];
        assert_eq!(
            pg["user"].as_str(),
            Some("donato_links_reader"),
            "Use apenas a conta de leitura nos aplicativos"
        );
        for field in ["host", "database", "password"] {
            assert!(
                pg[field].as_str().is_some_and(|s| !s.is_empty()),
                "Configuração do leitor incompleta"
            );
        }
        let port = pg["port"]
            .as_u64()
            .filter(|n| (1..=65535).contains(n))
            .expect("Porta PostgreSQL inválida");
        json!({"source":"postgres","catalogUrl":null,"pollIntervalMinutes":interval,
            "postgres":{"host":pg["host"],"port":port,"database":pg["database"],
                "user":"donato_links_reader","password":pg["password"]}})
    } else {
        if env::var("PROFILE").as_deref() == Ok("release") {
            assert!(config["catalogUrl"].as_str().is_some_and(|s| s.starts_with("https://")),
                "Configure server/data/client-rds.json antes de gerar o instalador, ou configure uma API HTTPS");
        }
        json!({"source":"https","catalogUrl":config["catalogUrl"],"pollIntervalMinutes":interval})
    };
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("client-config.json");
    fs::write(output, serde_json::to_vec(&bundled).unwrap())
        .expect("Não foi possível preparar a configuração inicial");
}
