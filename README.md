# Links Úteis DONATO

Central de atalhos de trabalho para Windows, feita com **Tauri 2, React e TypeScript**.

O projeto também inclui um **painel administrador no navegador**, com PostgreSQL/RDS, além de SQLite para uso local e testes. A versão Windows **0.3.6** pode consultar o RDS diretamente, usando uma conta somente de leitura: siga [Consulta direta das máquinas ao RDS](#consulta-direta-das-maquinas-ao-rds). O painel usa seu próprio backend para publicar. A consulta por API HTTPS e a publicação manual de JSON continuam disponíveis como alternativas.

A interface usa o azul Donato `#0878B9`. O símbolo em `artifacts/donato-eye.svg` foi corrigido conforme a referência da marca, com recortes nas bordas superior esquerda e inferior direita e fundo transparente. O mesmo SVG aparece na lateral e no favicon; a versão centralizada em `app-icon.svg` gera os ícones Windows em `src-tauri/icons/`. Para regenerá-los, execute `npm run tauri icon -- app-icon.svg`.

## Experimentar no navegador

```powershell
npm install
npm run dev
```

Acesse http://127.0.0.1:1420.

## Aplicativo e instalador Windows

Instale os [requisitos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/): Rust, Microsoft C++ Build Tools e WebView2. Selecione Desenvolvimento para desktop com C++ no Build Tools e reabra o terminal após instalar Rust.

Para desenvolver:

```powershell
npm run tauri dev
```

Para gerar o aplicativo e o instalador:

```powershell
npm run tauri build
```

O executável fica em `src-tauri/target/release/LINKS ÚTEIS DONATO.exe`, com o ícone Donato incorporado. O instalador NSIS fica em `src-tauri/target/release/bundle/nsis/`. Use `npm run tauri build` para gerar o nome final; `cargo build` usa o nome interno do pacote Rust. O script de compilação acompanha mudanças nos arquivos de ícone para incorporá-las nas próximas versões.

O aplicativo sempre inicia com a janela maximizada, mantendo a barra de título e os controles do Windows visíveis. **F11** permite entrar ou sair da tela cheia; **Esc** sai da tela cheia. Clicar novamente na categoria selecionada desmarca a opção e mostra todos os links.

## Catálogo de trabalho

Os 11 atalhos iniciais são EAGLESOFT, ONEDRIVE, NOTIFICAÇÃO, MODULOS, WORD, WARELINE WEB, TEAMS, EXCEL, SUPORTE TI, POWER POINT e OUTLOOK. O catálogo inicial embutido está em `src/catalog.initial.json`, preservando os URLs fornecidos. `public/catalog/links.json` é a cópia preparada para publicação no servidor. A versão 0.2.0 consulta um catálogo central ao abrir e a cada hora enquanto o programa estiver aberto, com cache persistente offline.

- O filtro **Todos** reúne o catálogo. A lateral gera as categorias automaticamente; novas categorias publicadas no servidor aparecem sem recompilar. O catálogo inicial contém **Trabalho** (5 sistemas) e **Ferramentas Microsoft** (6 ferramentas).
- Sem cadastro, edição ou remoção de links pela interface.
- Pesquisa por nome, descrição e endereço, sem diferenciar acentos; atalho **Ctrl+K**.
- Visualização em cards ou lista, com ordem alfabética A–Z por padrão e opção Z–A.
- A ordem personalizada e a reorganização por arraste foram removidas. Preferências antigas de ordem são descartadas; links novos e atualizados aparecem em ordem alfabética.
- Logos incluídos em `public/logos/`; fontes e imagens são locais. As origens dos logos estão em `public/logos/sources.json`. Os produtos Microsoft usam ícones do CDN da Microsoft e os demais usam favicons públicos. O Wareline usa o favicon do site público da marca. Se uma imagem falhar, o card exibe a inicial do nome.
- O aplicativo Tauri abre os links no navegador padrão. O endereço Wareline Web depende da rede da instituição; nenhuma autenticação é feita pelo aplicativo.

Para atualizar as imagens públicas, execute `node scripts/download-logos.mjs`.

## Verificação

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes verificam substituição dos exemplos, URLs exatos, logos, pesquisa, ordenação alfabética e layout responsivo. A geração nativa requer Rust e as ferramentas C++ instaladas.

Após gerar a versão Windows, `node scripts/verify-windows-icon.mjs` confere se todos os tamanhos de ícone incorporados ao executável correspondem ao arquivo Donato em `src-tauri/icons/icon.ico`.

## Configurar atualizações automáticas: passo a passo

### 1. Publicar o catálogo no servidor

Use um servidor HTTPS acessível pelas estações. Um servidor IIS da instituição é suficiente; não é necessário banco de dados. O endereço usado abaixo, `https://links.suaempresa.com.br/catalog/links.json`, é apenas um exemplo e precisa ser substituído pelo endereço real.

1. No Windows Server, habilite IIS com **Conteúdo Estático**. Crie uma pasta para o site, por exemplo `C:\inetpub\DonatoLinks`.
2. Crie a subpasta `catalog` e copie `public/catalog/links.json` para ela.
3. Copie `deployment/web.config` para a raiz do site. Ele configura `.json` como `application/json` e desabilita cache HTTP. Se o site existente já tiver `web.config`, incorpore essas configurações sem sobrescrever as demais. [Documentação de MIME do IIS](https://learn.microsoft.com/en-us/iis/configuration/system.webServer/staticContent/mimeMap).
4. No Gerenciador do IIS, crie um site apontando para essa pasta e configure um binding **HTTPS/443** com o hostname escolhido e um certificado confiável nas estações. Configure o DNS desse hostname para o servidor e permita acesso à porta 443 na rede das máquinas.
5. Habilite leitura por **Autenticação Anônima** para o catálogo. O aplicativo não faz login Microsoft/Windows no servidor. Restrinja a publicação/alteração dos arquivos à equipe de TI. Se houver CA interna, distribua a confiança do certificado; o app usa o armazenamento de certificados do Windows e não ignora erros de TLS.
6. Confira, em uma estação, que o endereço real retorna o JSON, sem página de login ou redirecionamento para HTTP:

   ```powershell
   Invoke-RestMethod 'https://links.suaempresa.com.br/catalog/links.json'
   ```

O aplicativo desktop consulta o servidor pelo Rust, portanto não precisa configurar CORS. Para uma versão acessada pelo navegador, prefira hospedar o catálogo na mesma origem.

### 2. Definir o endereço que as instalações vão consultar

Há duas opções. Para instalações futuras sem configuração adicional por máquina, edite `deployment/client-config.json` **antes de gerar o instalador**:

```json
{
  "catalogUrl": "https://links.suaempresa.com.br/catalog/links.json",
  "pollIntervalMinutes": 60
}
```

Esse arquivo vira a configuração padrão embutida no executável. O projeto vem com `catalogUrl: null` porque o endereço real do servidor ainda não foi informado; nesse estado, os links funcionam localmente e a sincronização fica desativada.

Para configurar ou substituir o endereço em uma máquina **sem recompilar**, execute uma vez em PowerShell como administrador:

```powershell
.\deployment\Configure-DonatoLinks.ps1 -CatalogUrl 'https://links.suaempresa.com.br/catalog/links.json'
```

O script cria `%ProgramData%\DonatoLinks\client-config.json` em UTF-8 sem BOM, com intervalo de 60 minutos. Esse arquivo tem prioridade sobre a configuração embutida. Ele pode ser copiado junto com a instalação inicial por GPO ou por sua ferramenta de distribuição. Todos os usuários da máquina devem ter leitura; mantenha escrita restrita aos administradores/SYSTEM. Reabra o programa após mudar a configuração.

### 3. Gerar e distribuir a versão nova por GPO

1. Defina o endereço padrão conforme o passo 2, caso queira embuti-lo.
2. No computador de compilação, execute:

   ```powershell
   npm install
   npm run catalog:validate
   npm run tauri build
   ```

3. Use o MSI da versão **0.2.0**, gerado em `src-tauri\target\release\bundle\msi\`, para sua política de instalação de software por computador. O instalador NSIS também é gerado em `bundle\nsis\`, com instalação para todos os usuários. [Instaladores Windows do Tauri](https://v2.tauri.app/distribute/windows-installer/).
4. Coloque o MSI em um compartilhamento UNC acessível pelas contas dos computadores, configure a atribuição na GPO destinada às estações e teste primeiro em uma máquina piloto. Para máquinas que já têm a versão anterior, distribua esta atualização uma vez: o programa antigo não tem sincronização de catálogo.
5. Se não embutiu o endereço, copie também a configuração do passo 2 como parte desse provisionamento inicial.
6. Garanta o WebView2 nas estações. O instalador padrão pode precisar de conexão para instalar esse runtime quando ele não estiver presente; para máquinas isoladas, provisione o runtime previamente.

A GPO permanece responsável pela instalação do software. Depois disso, adicionar, editar ou remover links exige somente publicar o catálogo no servidor. Mudanças no código do aplicativo ainda exigem uma nova distribuição do programa.

### 4. Adicionar, editar ou remover links

Edite uma cópia do JSON publicado no servidor. Para adicionar um link, acrescente um objeto à lista `links` e incremente `version`, por exemplo de `1` para `2`:

```json
{
  "id": "novo-sistema",
  "name": "NOVO SISTEMA",
  "description": "Acesso ao novo sistema da instituição.",
  "url": "https://sistema.suaempresa.com.br/",
  "category": "Trabalho",
  "logo": "/donato-eye.svg"
}
```

- Mantenha IDs estáveis ao editar nomes ou endereços, para preservar a ordem. Use IDs únicos com letras minúsculas sem acento, números, hífen ou sublinhado, com até 64 caracteres.
- Uma categoria nova aparece automaticamente. O nome `Todos` é reservado para o filtro geral.
- Para remover um link, exclua seu objeto do catálogo e incremente a versão. A lista precisa continuar com pelo menos um item; um catálogo vazio é rejeitado para proteger contra publicação acidental.
- Os endereços dos sistemas aceitam HTTP ou HTTPS. O catálogo e os ícones remotos exigem HTTPS, sem credenciais embutidas na URL.
- Para ícones existentes, use os caminhos locais do catálogo inicial. Para sistemas novos, use `/donato-eye.svg` ou um endereço HTTPS de imagem PNG/JPEG/WebP/ICO, servido com o MIME correto e com até 512 KB. O app baixa a imagem e a salva no cache; se ela falhar, mantém o ícone anterior do link ou usa o símbolo Donato. Não basta adicionar um caminho `/logos/novo.png` ao servidor: ele não existe nos aplicativos já instalados.
- São aceitos até 500 links e até 8 MB para o catálogo final, incluindo imagens.

Antes de publicar, valide a cópia editada usando o projeto:

```powershell
npm run catalog:validate -- 'C:\caminho\links.json'
```

Substitua o arquivo publicado somente após validar, preferencialmente enviando um arquivo temporário e renomeando-o no servidor para evitar downloads durante uma gravação incompleta. Mantenha um backup do catálogo anterior. Para desfazer uma alteração, publique o conteúdo anterior com uma **versão maior**; versões menores que a cópia local são rejeitadas.

Cada app consulta ao abrir e a cada 60 minutos enquanto estiver aberto, sem botão de atualização. Uma máquina desligada, offline ou com o programa fechado recebe os links novos na próxima abertura com acesso ao servidor. O app não instala serviço ou tarefa agendada. Não há confirmação central de recebimento: a versão e a data da última sincronização aparecem na barra inferior do programa.

### 5. Conferir atualização e funcionamento offline

1. Abra o app na estação piloto com acesso ao servidor. Confira **Links atualizados**, a versão e a última sincronização na barra inferior.
2. Reorganize os cards. Publique um novo link e aumente a versão. Feche e reabra o programa ou espere uma hora: o novo card deve aparecer, mantendo a ordem dos links existentes.
3. Desconecte a rede e reabra o app. Os links e imagens recebidos devem continuar visíveis. A barra indica que a atualização está indisponível e que os links locais foram mantidos.
4. Reconecte a rede e reabra o app ou aguarde a próxima consulta horária.

No Windows, o catálogo e as imagens ficam em `%LOCALAPPDATA%\com.centraldesk.app\catalog-cache.json`, **por usuário**. A configuração em ProgramData vale para a máquina inteira. Um usuário que abre o app pela primeira vez sem rede recebe o catálogo inicial embutido; precisa conectar uma vez para receber atualizações. Se o cache estiver danificado, o programa usa esse catálogo inicial. A gravação do cache é atômica: falha de download, resposta inválida ou erro de gravação não substituem a última cópia válida. [Gravação atômica usada no aplicativo](https://docs.rs/atomic-write-file/latest/atomic_write_file/).

Sem rede, os cards permanecem visíveis; acessar os sites continua dependendo da conexão requerida por cada sistema. Apagar o cache, remover o perfil do usuário ou reinstalar limpando os dados remove a cópia recebida, mas o catálogo embutido continua disponível.

### Prévia no navegador

A prévia usa `public/client-config.json`, independente da configuração do Windows. Para testar a sincronização nela, defina `catalogUrl` como `/catalog/links.json` e `pollIntervalMinutes` como `60`. O navegador guarda o catálogo em `localStorage`; o aplicativo instalado usa o arquivo nativo descrito acima.

## Painel administrador e banco de dados

O painel em `server/public/` permite login, cadastro, edição, exclusão e ordenação de links, envio de imagens, categorias novas e renomeação de categorias. O rascunho fica separado da versão publicada. **Publicar alterações** cria uma versão maior automaticamente. O histórico permite recuperar uma versão anterior como rascunho e publicá-la novamente com uma versão maior.

O backend em `server/` usa Node.js com o driver `pg` para PostgreSQL/RDS, ou SQLite para uso local. Os links do rascunho são armazenados em uma tabela, as publicações em outra, e usuários/sessões também ficam no banco. `/api/links` consulta a publicação mais recente no banco a cada requisição, retornando o formato que os aplicativos já aceitam. Não é necessário editar JSON a cada alteração. A versão desktop 0.2.0 continua compatível, com consulta ao abrir, a cada hora e cache offline. A seleção do banco usa `DONATO_DB_ENGINE`; os passos de SQLite abaixo são uma alternativa local, e a seção RDS descreve o banco central.

### 1. Experimentar o painel neste computador

Instale **Node.js 24.x** e, na pasta do projeto, execute:

```powershell
npm run admin:start
```

Se o banco ainda não tiver administradores, o servidor cria automaticamente o acesso padrão: **usuário `admin`, senha `admin`**, com a senha armazenada como hash scrypt. Contas existentes não são alteradas ao iniciar. Para adicionar outro administrador ou redefinir uma senha, execute `npm run admin:setup`; senhas personalizadas precisam ter pelo menos 12 caracteres. A redefinição encerra as sessões desse usuário.

Para configurar explicitamente ou redefinir a conta `admin` com a senha `admin`, execute:

```powershell
npm run admin:setup -- --default
```

Acesse **http://127.0.0.1:3030/admin/**. O banco local fica em `server/data/donato.sqlite`, fora do controle de versão. O catálogo pode ser conferido em **http://127.0.0.1:3030/api/links**. Esse modo HTTP é para teste local; os aplicativos Windows exigem HTTPS para sincronizar.

Na primeira inicialização, o banco recebe o catálogo inicial embutido. Se já existe um JSON publicado com uma versão maior ou com links alterados, importe esse catálogo **ao criar o banco pela primeira vez**:

```powershell
npm run admin:setup -- --default --catalog 'C:\catalogo-atual\links.json'
```

O catálogo importado precisa ser válido. Em um banco já existente, `--catalog` não substitui os dados: as mudanças passam a ser feitas pelo painel. Ao migrar, mantenha uma versão inicial pelo menos igual à que já está nas máquinas, pois elas rejeitam versões anteriores.

### 2. Instalar o backend no Windows Server

1. Instale Node.js 24.x no servidor. Copie o projeto para uma pasta como `C:\DonatoLinks`, mantendo `server`, `src/catalog.initial.json`, `public/donato-eye.svg`, `public/logos`, `deployment`, `package.json` e `package-lock.json`. Execute `npm ci --omit=dev` para instalar o driver PostgreSQL e as dependências de produção. O painel não precisa de Rust ou compilação do frontend para funcionar.
2. Defina uma pasta persistente fora do diretório público para o banco. Em PowerShell, na pasta do projeto:

   ```powershell
   $env:DONATO_DB_PATH = 'C:\ProgramData\DonatoLinksServer\donato.sqlite'
   npm run admin:setup
   ```

   Se estiver migrando um catálogo existente, use `--catalog` como no passo anterior. Restrinja o acesso à pasta do banco aos administradores e à conta que executará o backend. Essa conta precisa de escrita na pasta, pois SQLite também cria arquivos `-wal` e `-shm`.
3. Copie `deployment/admin-settings.example.json` para `C:\ProgramData\DonatoLinksServer\settings.json`. Edite `origin` para o endereço HTTPS real do site, por exemplo:

   ```json
   {
     "origin": "https://links.suaempresa.com.br",
     "host": "127.0.0.1",
     "port": 3030,
     "dbPath": "C:\\ProgramData\\DonatoLinksServer\\donato.sqlite"
   }
   ```

   `origin` precisa ser exatamente a origem usada pelo navegador, incluindo porta caso não seja a padrão, sem caminho. O painel deve ser hospedado na raiz desse hostname. Ela determina a proteção de origem e o cookie seguro; não configure uma origem HTTP de rede.
4. Teste o processo com:

   ```powershell
   .\deployment\Start-DonatoAdmin.ps1 -ConfigPath 'C:\ProgramData\DonatoLinksServer\settings.json'
   ```

   Esse comando lê a configuração, define o ambiente e executa Node no diretório correto. Quando a origem é HTTPS, o login só funciona pelo endereço HTTPS do IIS, pois o cookie de sessão é seguro.
5. Para manter o processo ativo após reiniciar o servidor, configure um serviço na ferramenta adotada pela TI ou uma tarefa no **Agendador de Tarefas**. Para a tarefa: gatilho **Ao iniciar o computador**, execução mesmo sem usuário conectado, uma conta de serviço com as permissões descritas acima, reinício em caso de falha e sem limite de duração. A ação pode executar `powershell.exe` com:

   ```text
   -NoProfile -NonInteractive -WindowStyle Hidden -File "C:\DonatoLinks\deployment\Start-DonatoAdmin.ps1" -ConfigPath "C:\ProgramData\DonatoLinksServer\settings.json"
   ```

   Aplique a política de execução de scripts adotada pela instituição. Não inicie duas instâncias na mesma porta. O painel do navegador pode ser fechado; o processo Node deve continuar rodando para atender as máquinas.

### 3. Expor o painel e a API por HTTPS no IIS

O IIS recebe as conexões HTTPS e encaminha as requisições ao Node em `127.0.0.1:3030`. O banco permanece fora do site e não é disponibilizado pela API.

1. Instale IIS, **URL Rewrite** e **Application Request Routing (ARR)**.
2. No nível do servidor IIS, abra **Application Request Routing Cache → Server Proxy Settings** e habilite **Enable Proxy**. [Instruções oficiais de proxy reverso do IIS](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing).
3. Crie um site com uma pasta pública separada, por exemplo `C:\inetpub\DonatoAdminProxy`. Copie **somente** `deployment/admin-proxy.web.config` para essa pasta, com o nome `web.config`. Esse arquivo substitui a configuração de site estático usada no fluxo de JSON manual; não use os dois modelos juntos. Se mudar a porta do Node, ajuste o destino da regra.
4. Configure o binding HTTPS/443 com o hostname escolhido, certificado confiável nas máquinas e DNS apontando para o servidor. Libere a porta 443 para a rede que deve acessar o catálogo. A porta 3030 permanece somente em loopback.
5. Mantenha autenticação anônima no IIS para permitir a leitura pelos aplicativos. O painel exige o login próprio na API para ler ou alterar dados administrativos. O catálogo publicado é legível sem login, como exigido pelo sincronizador atual; restrinja seu alcance pela rede conforme os endereços internos da instituição.
6. Confira os endereços finais:
   - Painel: `https://links.suaempresa.com.br/admin/`
   - Catálogo: `https://links.suaempresa.com.br/api/links`

### 4. Conectar as máquinas ao painel

Configure uma vez o endereço da API no arquivo de configuração dos aplicativos, usando o script já disponibilizado:

```powershell
.\deployment\Configure-DonatoLinks.ps1 -CatalogUrl 'https://links.suaempresa.com.br/api/links'
```

Você pode distribuir a configuração junto da instalação inicial por GPO. Também pode embutir esse endereço em `deployment/client-config.json` antes de gerar instaladores futuros. Nenhuma credencial de administrador ou banco é distribuída aos aplicativos.

Para migrar sem mudar a configuração das máquinas que já consultam `https://links.suaempresa.com.br/catalog/links.json`, o backend oferece esse mesmo caminho como alias do catálogo do banco. Basta manter o hostname e substituir o site estático pelo proxy, com o catálogo atual importado na inicialização do banco.

### 5. Administrar os links

1. Entre no painel e clique em **Novo link**, ou em **Editar** em um link existente.
2. Informe nome, endereço, descrição e categoria. Para um ícone novo, envie SVG/PNG/JPEG/WebP/ICO de até 512 KB, escolha um ícone embutido ou informe uma URL HTTPS de imagem. Imagens enviadas ficam no banco junto da publicação e são armazenadas offline nas máquinas.
3. Clique em **Aplicar ao rascunho**. **Salvar rascunho** mantém a edição no banco sem distribuí-la ainda. Você pode renomear uma categoria para todos os links dela, excluir links ou ajustar a ordem com as setas.
4. Clique em **Publicar alterações**. O painel salva a edição pendente e gera a próxima versão. As máquinas conectadas recebem essa publicação na próxima abertura do aplicativo ou consulta horária.
5. Para desfazer uma publicação, abra **Publicações**, escolha **Restaurar como rascunho**, revise e publique. O número da versão continua aumentando, para que os aplicativos aceitem a recuperação.

No histórico de publicações, clique no título ou na seta à direita do botão de restaurar para expandir suas alterações. A publicação atual fica aberta por padrão. O resumo mostra somente links adicionados, removidos ou editados, os nomes dos campos alterados e mudanças nos ícones do menu lateral. O banco preserva o catálogo completo de cada publicação em `releases.catalog_json`, incluindo links e ícones, para comparar com a publicação anterior. A primeira publicação disponível aparece como referência, pois não há uma versão anterior para comparar.

O identificador de um link existente permanece fixo. Cada máquina exibe os links em ordem alfabética por padrão, inclusive após receber atualizações do catálogo. Se dois administradores editarem ao mesmo tempo, o servidor rejeita a gravação de um rascunho desatualizado; use **Recarregar** antes de refazer a edição. O painel não confirma quais máquinas já receberam uma publicação: a versão recebida e a última sincronização continuam visíveis em cada aplicativo.

### 6. Backup e verificação

Use o mesmo caminho de banco configurado no backend e execute:

```powershell
$env:DONATO_DB_PATH = 'C:\ProgramData\DonatoLinksServer\donato.sqlite'
npm run admin:backup -- 'D:\Backups\donato-2026-10-07.sqlite'
```

O comando usa a [API de backup do SQLite no Node.js](https://nodejs.org/api/sqlite.html#sqlitebackupsourcedb-path-options), permitindo backup consistente com o banco em uso. Evite copiar somente o arquivo principal enquanto o banco estiver ativo em modo WAL. Proteja o backup: ele inclui catálogo, hashes de administradores e sessões. Para restaurar um backup do banco, pare o processo antes de substituir seus arquivos e valide a versão do catálogo antes de reconectar as máquinas; elas rejeitam uma versão menor que a já recebida. Para desfazer apenas links, prefira a restauração pelo histórico do painel.

Testes do servidor, painel e aplicativo:

```powershell
npm run test:server
npm run test:admin
npm run test:e2e
```

Os testes do painel usam uma conta de teste e um banco em memória, isolados do banco real. Verifique a implantação em uma máquina piloto: publique um novo link, reabra o aplicativo, confira a versão recebida e depois reabra sem rede para confirmar que ele permanece visível. HTTPS/IIS e a inicialização automática precisam ser verificados no servidor onde serão configurados.

## PostgreSQL no RDS

O RDS configurado neste projeto é:

- Host: `systems.cho1rljqtj4r.sa-east-1.rds.amazonaws.com`
- Porta: `5432`
- Banco: **`linksdonato`** (o comando `psql` fornecido usava o banco administrativo `postgres`; o catálogo fica em `linksdonato`).
- Schema da aplicação: `donato_links`.
- Tabelas: `draft_links`, `releases`, `state`, `admins` e `sessions`.

O painel grava no RDS. As máquinas podem consultar diretamente a publicação com o usuário leitor descrito na próxima seção, ou continuar usando a API HTTPS. A credencial administrativa PostgreSQL fica somente no backend; no modo direto, as máquinas recebem uma credencial separada, limitada à publicação atual. O catálogo offline dos aplicativos permanece independente do banco central. As transações e bloqueios de edição protegem rascunhos/publicações mesmo quando duas instâncias do backend usam o mesmo RDS.

### Configuração privada e certificado

O backend lê `server/.env.local`, ignorado pelo Git. Neste computador, esse arquivo foi configurado com host, banco, usuário, schema, caminho do certificado e a variável `PGPASSWORD`. A variável `PGPASSWORD` também foi definida no perfil do usuário Windows. A senha não deve ser colocada nos arquivos de exemplo ou na configuração distribuída aos aplicativos.

Modelo **sem senha**, para preparar a configuração em outro servidor:

```dotenv
DONATO_DB_ENGINE=postgres
PGHOST=systems.cho1rljqtj4r.sa-east-1.rds.amazonaws.com
PGPORT=5432
PGDATABASE=linksdonato
PGUSER=postgres
PGSSLROOTCERT=deployment/certificates/global-bundle.pem
DONATO_PG_SCHEMA=donato_links
```

Disponibilize `PGPASSWORD` no ambiente da conta do backend ou acrescente essa variável ao arquivo privado. Como alternativa, `PGPASSWORD_FILE` pode apontar para um arquivo privado contendo somente a senha. O serviço/tarefa deve ter leitura desse arquivo. Variáveis do ambiente têm prioridade sobre o arquivo local. Uma variável de usuário Windows vale para aquele usuário; uma tarefa executada por outra conta precisa receber sua própria configuração privada.

O certificado em `deployment/certificates/global-bundle.pem` foi baixado do [truststore oficial do RDS](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem). A conexão exige validação da CA e do hostname, equivalente a `sslmode=verify-full`; não há opção para ignorar a validação. [SSL no PostgreSQL/RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).

Confira a conexão:

```powershell
npm install
npm run admin:db:check
```

O comando informa somente o nome do banco e a validação TLS, sem imprimir credenciais. O backend precisa alcançar o RDS em TCP/5432. Configure o Security Group/rede do RDS para permitir a origem do backend, e mantenha o acesso das estações pela API HTTPS.

### Migrar o catálogo local e iniciar

A migração do banco SQLite deste computador para `linksdonato` já foi executada. Ela preserva links, rascunho, números de versão, histórico e hashes das contas de administrador. O arquivo SQLite original é mantido; sessões antigas precisam de novo login.

Para migrar uma instalação diferente para um **schema ainda vazio**, pare o backend e execute:

```powershell
npm run admin:migrate:rds -- 'C:\caminho\donato.sqlite'
```

O comando usa a configuração RDS privada e cancela se o schema já tiver catálogo, para não sobrescrever publicações existentes. Não é necessário executar novamente nesta instalação. Em instalações novas que já vão usar o mesmo RDS, basta configurar o backend e iniciar: ele reutiliza o catálogo existente, sem criar uma cópia local.

```powershell
npm run admin:start
```

O acesso do painel continua sendo `admin` / `admin`, conforme configurado. O endpoint `/api/links` e o alias `/catalog/links.json` devolvem a publicação do RDS. `/health` verifica leitura do banco e identifica `databaseEngine: postgres`; se o RDS ficar indisponível, a API retorna erro e os aplicativos mantêm seu cache anterior.

Para iniciar pela tarefa/serviço Windows, use `deployment/rds-settings.example.json` como modelo do arquivo passado a `Start-DonatoAdmin.ps1`. Ajuste `origin` para o HTTPS real do painel e `postgresCaPath` para o certificado nesse servidor. A senha continua no ambiente/arquivo privado, ou use a propriedade `postgresPasswordFile` no JSON para indicar a localização do arquivo de senha. Siga a configuração HTTPS/IIS descrita acima.

### Conectar os aplicativos e fazer backup

No modo alternativo por API, configure `catalogUrl` como `https://SEU-HOSTNAME/api/links`, mantendo `pollIntervalMinutes: 60`. O script `Configure-DonatoLinks.ps1` continua válido nesse modo. No modo direto escolhido, siga a próxima seção; não é necessário um endereço HTTPS para distribuir o catálogo às máquinas.

Para backup do banco central, use backups/snapshots do RDS ou `pg_dump` com SSL verificado. `npm run admin:backup` é exclusivo do modo SQLite e rejeita execução quando o banco ativo é PostgreSQL, evitando salvar uma cópia local desatualizada por engano. Ao restaurar um banco antigo, confira a versão publicada, pois os aplicativos rejeitam números menores que a versão já recebida.

Os testes locais normais continuam usando SQLite isolado. Para testar o PostgreSQL real:

```powershell
$env:DONATO_TEST_POSTGRES = '1'
node --test server/tests/postgres.integration.test.mjs
```

Esse teste cria um schema aleatório `donato_test_*`, verifica edições/publicações concorrentes, histórico, sessões e leitura entre duas instâncias, e remove somente esse schema ao terminar. Ele não altera o catálogo `donato_links`.

## Consulta direta das máquinas ao RDS

No cadastro pelo painel, endereços sem prefixo são completados automaticamente: `donato.com.br/portal` vira `https://www.donato.com.br/portal` e `www.example.com` recebe `https://`. Endereços completos, subdomínios, IPs e nomes internos são preservados; nesses últimos, quando não há protocolo, é adicionado apenas `https://`. A regra também é aplicada pelo backend antes de salvar ou publicar. Para serviços que exigem HTTP ou um domínio sem `www`, informe o endereço completo. Após atualizar o servidor, recarregue a página do painel; não é necessário reinstalar os aplicativos.

O aplicativo Windows 0.3.3 já inclui a conexão PostgreSQL de leitura no executável. Basta distribuir o instalador pela GPO, sem copiar um arquivo de conexão separado. A consulta ocorre ao abrir e a cada hora, sem botão de atualização, e usa TLS com o certificado oficial do RDS incluído no executável. `%ProgramData%\DonatoLinks\client-config.json` continua disponível para substituir a conexão por outra configuração válida; um arquivo antigo com `catalogUrl: null` usa a conexão embutida.

O fluxo é:

```text
Painel no navegador → backend administrador → RDS linksdonato
Aplicativos Windows → RDS linksdonato → cópia local offline
```

O painel precisa do backend para editar e publicar, porque o navegador não abre uma conexão PostgreSQL. Depois de publicar, o backend/painel pode ficar indisponível e os aplicativos ainda recebem a publicação diretamente do RDS, desde que consigam acessar o banco. Os aplicativos não dependem da API para sincronizar nesse modo.

### Usuário das máquinas

Foi criado o usuário **`donato_links_reader`**, com senha aleatória própria. Ele tem acesso à view **`donato_links.published_catalog`**, que retorna apenas a publicação mais recente. Ele não tem acesso aos hashes de administradores, sessões, rascunhos ou escrita nas tabelas do catálogo. A conta `postgres` fornecida é usada somente pelo backend administrador e não é enviada às estações.

O arquivo gerado em **`server/data/client-rds.json`** contém a conexão e a credencial do leitor. Ele é ignorado pelo Git. Ao compilar a versão 0.3.3 ou posterior, `src-tauri/build.rs` usa esse arquivo para incluir somente os campos da conexão de leitura na parte nativa, sem devolvê-los à interface React. O build rejeita outra conta que não seja `donato_links_reader`. A senha administrativa permanece no ambiente privado do backend. Se não houver conexão de leitura nem API HTTPS configurada, a compilação de produção falha para evitar distribuir novamente um aplicativo sem sincronização.

O provisionamento já foi executado. Para recriar as permissões com a mesma credencial local, se necessário:

```powershell
npm run admin:reader:setup
```

Se o usuário leitor já existir e o arquivo local tiver sido perdido, o comando cancela para não redefinir sua senha e interromper outras máquinas. Recupere uma cópia desse arquivo antes de reprovisionar.

### Instalar e configurar as demais máquinas

1. Distribua o MSI **0.3.4**, localizado em `src-tauri\target\release\bundle\msi\`. Configure o novo pacote como atualização do anterior na GPO. Essa versão inclui a conexão de leitura e funciona sem o arquivo em ProgramData.
2. Para corrigir máquinas que ainda usam a versão 0.3.2 sem atualizar o instalador, copie `server/data/client-rds.json` para **`%ProgramData%\DonatoLinks\client-config.json`** pela GPO: Configuração do Computador → Preferências → Configurações do Windows → Arquivos, ação Atualizar, origem em um compartilhamento UNC acessível às contas dos computadores. Todas as contas que usam o app precisam de leitura; a equipe de TI controla alterações na configuração. Feche e reabra o aplicativo depois da cópia.
3. Como alternativa à cópia por GPO para as versões anteriores, execute em PowerShell como administrador:

   ```powershell
   .\deployment\Configure-DonatoLinksRds.ps1 -ConfigPath '.\server\data\client-rds.json'
   ```

4. Garanta que as estações alcancem `systems.cho1rljqtj4r.sa-east-1.rds.amazonaws.com` em **TCP/5432**. A regra de rede/Security Group do RDS precisa permitir a origem das estações ou da VPN/NAT usada por elas. A regra que permite apenas o servidor do painel é suficiente para o modo API, mas não para o modo direto.
5. Abra o app e confira **Links atualizados** na barra inferior. Publique uma alteração pelo painel e reabra o app ou aguarde uma hora. Depois teste a reabertura sem acesso à rede: o último catálogo e seus ícones devem continuar visíveis.

O certificado está incluído no aplicativo, e não é necessário instalar Node.js ou `psql` nas estações. Cada consulta abre uma conexão PostgreSQL e a encerra após ler a publicação; o aplicativo não mantém uma conexão por máquina durante toda a hora. Se houver falha de rede, TLS, autenticação ou indisponibilidade do RDS, ele preserva a última cópia válida. Computadores que ainda não receberam nenhuma atualização mostram o catálogo inicial embutido.

Para confirmar a leitura e as restrições de acesso no RDS:

```powershell
$env:DONATO_TEST_POSTGRES = '1'
node --test server/tests/reader.integration.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml --lib reads_published_catalog_directly_from_rds -- --ignored
```

Esses testes leem a publicação com a conta das máquinas, verificam TLS e confirmam que a escrita e a leitura de administradores são negadas. Não publicam nem modificam os links em produção.

## Arquivos e pastas compartilhadas (0.3.4)

Atualize as máquinas para a versão 0.3.4 antes de publicar atalhos de arquivos ou pastas: as versões anteriores validam somente sites HTTP/HTTPS e rejeitam um catálogo com `file:`.

No painel, cadastre um atalho normalmente e preencha **Endereço** com um destes formatos:

- `\\servidor\GERAL\ÁREA DE TRANSFERENCIA\Lista Nova.xlsx`
- `O:\GERAL\ÁREA DE TRANSFERENCIA\Lista Nova.xlsx`
- `file:///O:/GERAL/%C3%81REA%20DE%20TRANSFERENCIA/Lista%20Nova.xlsx`
- `\\servidor\GERAL\Pasta da equipe` para abrir uma pasta.

O painel converte os caminhos para URLs `file:` preservando espaços, acentos e caracteres como `#`. Publique o catálogo para distribuir os atalhos pelo RDS, ao abrir os aplicativos ou na próxima consulta de hora em hora.

No aplicativo Windows, arquivos abrem no programa padrão (Excel, Word, leitor de PDF etc.) e pastas abrem no Explorer, com as permissões do usuário conectado. A abertura nativa recebe apenas o ID de um item do catálogo local e resolve o caminho validado na cópia publicada, sem comandos de shell montados a partir do endereço. Sites continuam abrindo no navegador. A prévia pelo navegador informa que arquivos precisam do aplicativo Windows.

Prefira o caminho UNC `\\servidor\compartilhamento\...`: ele não depende de uma letra de unidade. Se usar `O:`, a unidade precisa estar mapeada para o mesmo compartilhamento em cada sessão de usuário. O app não cria mapeamentos nem concede acesso aos arquivos. Os atalhos permanecem visíveis offline, mas abrir um arquivo da rede exige conexão ao compartilhamento; o app não baixa o conteúdo dos arquivos para o cache.

## Correção do instalador MSI 0.3.1

O template `src-tauri/installer/main.wxs` mantém o executável no componente obrigatório da aplicação, independentemente dos atalhos opcionais. A ação de abrir o aplicativo ao finalizar usa o caminho instalado, sem a ação FileKey que causa o erro MSI 2753 quando o arquivo não está marcado para instalação. O UpgradeCode é preservado para atualizar versões anteriores.

Feche o instalador anterior e use o MSI mais recente gerado em `src-tauri/target/release/bundle/msi/`. Não remova manualmente a configuração em `%ProgramData%\DonatoLinks` nem o cache do aplicativo. Na GPO, substitua o pacote antigo pelo novo MSI e configure a atualização do pacote anterior. Use apenas um formato de instalador por máquina (MSI para a GPO).

Validação da versão 0.3.1 nesta máquina: instalação silenciosa com `ADDLOCAL=MainProgram AUTOLAUNCHAPP=1` terminou com código 0, instalou o executável sem os atalhos opcionais e abriu o programa. Reinstalação forçada (`REINSTALL=ALL REINSTALLMODE=amus`) terminou com código 3010 (sucesso com reinicialização pendente), sem erro 2753. Os registros estão em `src-tauri/target/msi-0.3.1-install.log` e `src-tauri/target/msi-0.3.1-reinstall.log`. O UpgradeCode continua sendo `534207d1-d768-5eae-b380-a1d6abdfb5b5`.

## Atualização 0.3.5 por GPO e ícones do menu

O MSI x64 fica em `src-tauri/target/release/bundle/msi/LINKS ÚTEIS DONATO_0.3.5_x64_en-US.msi`. A versão 0.3.5 inclui o símbolo Donato corrigido e transparente, ordem A–Z por padrão, remoção da ordem personalizada e ícones de categorias configuráveis.

O pacote instala por máquina, preserva o UpgradeCode `534207D1-D768-5EAE-B380-A1D6ABDFB5B5`, usa novo ProductCode e bloqueia downgrade. A configuração em ProgramData e os caches dos usuários ficam fora dos arquivos removidos pelo MSI. Copie o novo pacote para um compartilhamento UNC com leitura para as contas dos computadores. Na GPO, use **Configuração do Computador → Políticas → Configurações de Software → Instalação de Software**, adicione o MSI como **Atribuído** e configure a aba **Atualizações** para substituir o MSI anterior. Use o caminho UNC completo ao adicionar o pacote, conforme a [documentação da Microsoft](https://learn.microsoft.com/en-us/troubleshoot/windows-server/group-policy/use-group-policy-to-install-software). A atualização automática MSI depende de a versão anterior ter sido instalada por MSI; máquinas com NSIS precisam migrar para MSI.

Verificação dos metadados antes de distribuir:

```powershell
./scripts/verify-msi.ps1 -MsiPath 'src-tauri/target/release/bundle/msi/LINKS ÚTEIS DONATO_0.3.5_x64_en-US.msi' -PreviousMsiPath 'src-tauri/target/release/bundle/msi/LINKS ÚTEIS DONATO_0.3.4_x64_en-US.msi'
```

No painel, clique em **Ícones do menu lateral**, escolha a categoria ou **Todos** e selecione um ícone embutido, uma imagem HTTPS ou envie SVG/PNG/JPEG/WebP/ICO de até 512 KB. Clique em **Aplicar ícone ao rascunho** e depois em **Publicar alterações**. Repita para outros itens antes de publicar, se desejar. **Padrão** restaura o símbolo original do item. Renomear a categoria leva seu ícone para o novo nome.

Os ícones ficam no campo opcional `categoryIcons` do catálogo, incluindo a chave `Todos`; catálogos antigos continuam válidos. O backend adiciona automaticamente `state.category_icons` ao iniciar. Atualize o backend do painel junto com esta entrega. O painel local em `http://127.0.0.1:3030/admin/` já foi reiniciado com o recurso. Depois de instalar a 0.3.5 uma vez, mudar os ícones pelo painel requer apenas publicar: o aplicativo sincroniza ao abrir ou a cada hora e guarda as imagens para uso offline. Versões anteriores ignoram os ícones de categorias.

Ícones SVG do menu (incluindo URLs terminadas em `.svg` com parâmetros) são convertidos para PNG de até 256 px no painel antes de aplicar ao rascunho. Isso permite que a 0.3.5 receba a imagem sem atualizar o instalador. Se o servidor da imagem bloquear a conversão por CORS, baixe o SVG e use **Enviar imagem do computador**. A falha de conversão permanece visível no diálogo e não altera o rascunho.

## Reinício do contador de publicações

O painel usa `displayVersion` para o contador visível, enquanto `version` permanece crescente para sincronização dos aplicativos. O reinício de 08/10/2026 manteve o catálogo atual como v0 no painel e retirou o histórico anterior, com backup em `server/data/version-reset-backup-*.json`. Novas publicações passam a v1, v2 e assim por diante; restaurações continuam usando os identificadores internos. O reinício não exige alterar caches ou reinstalar aplicativos. Aplicativos antigos ainda mostram o número interno no rodapé.

O painel ordena os itens por nome (A–Z, português do Brasil) na prévia, ao salvar e ao publicar. Inclusões e renomeações são reposicionadas automaticamente; botões de mover itens foram removidos. A 0.3.5 também ordena os cards após cada sincronização, inclusive com pesquisa, filtros e visualização em lista. Versões antigas que guardam ordem personalizada precisam ser atualizadas para a 0.3.5.

## Contador do painel no aplicativo Windows (0.3.6)

Distribua `src-tauri/target/release/bundle/msi/LINKS ÚTEIS DONATO_0.3.6_x64_en-US.msi` como atualização do MSI 0.3.5. A 0.3.6 lê e preserva `displayVersion` na camada nativa e no cache; o rodapé passa a mostrar o mesmo contador do painel, inclusive v0. `version` permanece interno e crescente para rejeitar catálogos anteriores. Catálogos que não têm `displayVersion` continuam mostrando `version`. Abra com conexão uma vez após atualizar para receber o contador do painel; depois ele permanece visível offline. A versão do instalador (0.3.6) é independente do contador de publicações (v0, v1 etc.).
