# Links Úteis DONATO

Central de atalhos de trabalho para Windows, feita com **Tauri 2, React e TypeScript**.

A interface usa o azul Donato `#0878B9`, extraído do SVG fornecido em `artifacts/donato-eye.svg`. O mesmo SVG aparece na lateral e no favicon; a versão centralizada em `app-icon.svg` gera os ícones Windows em `src-tauri/icons/`. Para regenerá-los, execute `npm run tauri icon -- app-icon.svg`. O menu compacto mantém a categoria Trabalho com ícone e texto.

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

Os 11 atalhos fixos são EAGLESOFT, ONEDRIVE, NOTIFICAÇÃO, MODULOS, WORD, WARELINE WEB, TEAMS, EXCEL, SUPORTE TI, POWER POINT e OUTLOOK. Os endereços estão em `src/data.ts`, preservando os URLs fornecidos.

- O filtro **Todos** reúne os 11 links. A lateral exibe **Trabalho** (5 sistemas), **Ferramentas Microsoft** (OneDrive, Word, Teams, Excel, PowerPoint e Outlook) e, por último, **Todos**. As três opções aparecem também no menu compacto, com palavras inteiras nos rótulos.
- Sem cadastro, edição ou remoção de links pela interface.
- Pesquisa por nome, descrição e endereço, sem diferenciar acentos; atalho **Ctrl+K**.
- Favoritos, cards ou lista e ordenação alfabética.
- Arraste para reorganizar na ordem personalizada.
- Ordem e favoritos salvos em `centraldesk.work.preferences` no `localStorage`. O catálogo substitui automaticamente os exemplos antigos; dados salvos não sobrescrevem nomes ou endereços. Navegador e Tauri possuem preferências independentes.
- Logos incluídos em `public/logos/`; fontes e imagens são locais. As origens dos logos estão em `public/logos/sources.json`. Os produtos Microsoft usam ícones do CDN da Microsoft e os demais usam favicons públicos. O Wareline usa o favicon do site público da marca. Se uma imagem falhar, o card exibe a inicial do nome.
- O aplicativo Tauri abre os links no navegador padrão. O endereço Wareline Web depende da rede da instituição; nenhuma autenticação é feita pelo aplicativo.

Para atualizar as imagens públicas, execute `node scripts/download-logos.mjs`.

## Verificação

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes verificam substituição dos exemplos, URLs exatos, logos, pesquisa, favoritos, ordenação, arraste e layout responsivo. A geração nativa requer Rust e as ferramentas C++ instaladas.

Após gerar a versão Windows, `node scripts/verify-windows-icon.mjs` confere se todos os tamanhos de ícone incorporados ao executável correspondem ao arquivo Donato em `src-tauri/icons/icon.ico`.
