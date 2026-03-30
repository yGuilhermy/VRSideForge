<p align="center">
  <img src="frontend/src/app/icon.png" width="128" height="128">
</p>

<h1 align="center">VR Rookie Downloader</h1>

<p align="center">
  🌐 <a href="README.md">Português</a> | <a href="README-EN.md">English</a>
</p>

<p align="center">
  Sistema avançado e automatizado para catálogo, download e instalação (sideloading) de conteúdo VR a partir do Rutracker.
</p>

<p align="center">
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/></a>
  <a href="https://nextjs.org/" target="_blank"><img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js"/></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
</p>

## Aviso Legal (Disclaimer)

O **VR Rookie Downloader** é uma ferramenta de indexação técnica. É imperativo compreender a natureza do software:

- **Apenas Indexação:** Este sistema não hospeda, armazena ou distribui qualquer tipo de conteúdo protegido por direitos autorais. O software funciona exclusivamente como um rastreador (scraper) que organiza metadados de fontes de terceiros (Fórum Rutracker).
- **Isenção de Responsabilidade:** O projeto é fornecido "como está", sem garantias de qualquer tipo. O uso desta ferramenta para acessar ou baixar conteúdo é de inteira e exclusiva responsabilidade do usuário final.
- **Propriedade Intelectual:** Respeitamos os direitos de propriedade intelectual. Caso você seja proprietário de algum conteúdo e deseja que ele não seja acessível através dos meios de busca padrão, por favor, entre em contato com as fontes originais indexadas.
- **Desenvolvimento:** Este aplicativo foi construído com o auxílio de ferramentas de IA para otimização de código e design.
- **Finalidade:** O software foi desenhado para facilitar a organização de bibliotecas VR pessoais e estudos técnicos de automação de sistemas.

## TLDR; Jogos no seu VR em poucos passos

1. Abra o aplicativo e siga o **Assistente de Configuração Inicial (Setup Wizard)** para validar sua sessão, dependências (ADB/qBittorrent) e idioma.
2. Inicie o indexador para construir seu catálogo.
3. Escolha um jogo, baixe via qBitTorrent e instale no Quest via USB.

## Funcionalidades Dinâmicas

### Indexação de Links do Rutracker

**Captura automatizada de metadados diretamente do fórum original**

-   Extração de **Gênero**, **Versão**, **Desenvolvedor** e estatísticas de **Seeds/Leechers**.
-   **Sistema Multi-idioma:** Interface disponível em **Inglês (padrão)** e **Português**, com troca dinâmica nas configurações.
-   **Tradução Flexível:** Escolha o idioma de destino para as traduções dos jogos (Inglês ou Português).
-   **Interface Otimizada:** Botão para ocultar/mostrar a barra lateral de filtros para focar na visualização dos jogos.

### Gestão de Downloads

**Integração total com o qBitTorrent Web UI**

- Controle remoto de downloads.
- Monitoramento de progresso em tempo real diretamente na biblioteca.
- Sincronização automática entre arquivos físicos no HD e o banco de dados.

### Sideloading

**Instalação nativa via ADB (Android Debug Bridge)**

- Transferência automatizada de arquivos APK e pastas de dados (OBB).
- Suporte para múltiplos dispositivos detectados via USB.

## Instalação (Manual)

> Aviso: O projeto está em fase de desenvolvimento e pode conter bugs.

**A instalação requer configuração prévia de dependências do sistema. Siga o processo abaixo.**

<details>
<summary>Clique para ver o processo de instalação</summary>

### 1. Requisitos do Sistema

- **[Node.js](https://nodejs.org/):** Versão 18.x ou superior.
- **[qBitTorrent](https://www.qbittorrent.org/):** É necessário configurar a **Web UI** para que o app possa gerenciar os downloads:
  1. Abra o qBitTorrent e vá em `Ferramentas` -> `Opções` -> `Web UI`.
  2. Marque a caixa **Interface de Usuário da Web (Controle Remoto)**.
  3. No campo **Endereço IP**, use `127.0.0.1` e na **Porta**, use `8080` (padrão do projeto).
  4. Em **Autenticação**, verifique se o usuário é `admin`.
  5. **Senha:** O projeto está configurado para usar a senha padrão `adminadmin`. Caso deseje usar outra, você precisará atualizar a função `loginQbit` no arquivo `backend/src/index.ts`.
  6. (Opcional) Marque **Ignorar autenticação para clientes no host local** para simplificar a conexão.
- **[ADB (Android Debug Bridge)](https://developer.android.com/tools/adb):** O binário `adb` **DEVE** estar configurado no **PATH** do sistema operacional.

### 2. Configuração do Ambiente

Clone o repositório e execute o instalador automatizado:

```powershell
git clone https://github.com/usuario/VRRookieDownloader.git
cd VRRookieDownloader
.\setup.bat
```

O script de setup verificará a presença do Node.js e do ADB no seu PATH antes de instalar as dependências do projeto.

---

### Execução

Para iniciar o projeto:

```powershell
.\start.bat
```

_Execute como Administrador se desejar utilizar o domínio local `http://vrrookie.local`._

</details>

## Guia de Uso

### 1. Configuração Inicial

- Acesse a aba **Configurações**.
- **Idioma da Interface:** Escolha entre Inglês ou Português para todos os menus e botões.
- **Idioma de Tradução:** Selecione o idioma para o qual as descrições dos jogos (originalmente em russo) serão traduzidas.
  - _Nota: Ao mudar o idioma de tradução, você pode usar a opção "Reconstruir Banco de Dados" no Painel Admin para atualizar os jogos já indexados._
- Defina o caminho completo da pasta onde seus jogos serão baixados.
- Realize o login no Rutracker através da interface para habilitar o scraper.

### 2. Catálogo e Download

- **Personalização de Busca:** Você pode alterar os termos de pesquisa padrão (como "Quest 3", "PCVR") editando as `baseQueries` no arquivo `backend/src/scraper/worker.ts` (linhas 231-235).
- Utilize o botão **Iniciar Indexador** para buscar novos títulos do fórum.
- Clique no card do jogo para abrir os detalhes e clique em **Baixar no Servidor**.
- O jogo será enviado automaticamente para o seu qBitTorrent.

### 3. Instalação (Sideloading)

- Com o download concluído no PC, conecte seu headset VR via USB.
- No menu do jogo baixado, clique em **Instalar no Quest**.
- O sistema gerenciará a instalação do APK e dos arquivos OBB.

## Stack Técnica

| Camada           | Tecnologia                                       |
| :--------------- | :----------------------------------------------- |
| **Frontend**     | Next.js 15 (App Router), Tailwind CSS, Shadcn UI |
| **Backend**      | Node.js, Express, TypeScript                     |
| **Persistência** | SQLite (Better-SQLite3)                          |
| **Automação**    | Puppeteer Stealth, Cheerio, ADB Tools            |
| **Comunicação**  | Socket.io, React Query, Zustand                  |

---

_Gerencie sua biblioteca VR local com eficiência e automação._
