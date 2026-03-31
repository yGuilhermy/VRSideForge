<p align="center">
  <img src="frontend/src/app/icon.png" width="128" height="128">
</p>

<h1 align="center">VR Rookie Downloader</h1>

<p align="center">
  🌐 <a href="README-PT.md">Português</a> | <a href="README.md">English</a>
</p>

<p align="center">
  Advanced and automated system for cataloging, downloading, and sideloading VR content from Rutracker.
</p>

<p align="center">
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/></a>
  <a href="https://nextjs.org/" target="_blank"><img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js"/></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
</p>

## Legal Disclaimer

**VR Rookie Downloader** is a technical indexing tool. It is imperative to understand the nature of the software:

- **Indexing Only:** This system does not host, store, or distribute any type of copyrighted content. The software works exclusively as a scraper that organizes metadata from third-party sources (Rutracker Forum).
- **Disclaimer:** The project is provided "as is", without warranties of any kind. The use of this tool to access or download content is the sole and exclusive responsibility of the end user.
- **Intellectual Property:** We respect intellectual property rights. If you are the owner of any content and wish for it not to be accessible through standard search means, please contact the original indexed sources.
- **Development:** This application was built with the help of AI tools for code and design optimization.
- **Purpose:** The software was designed to facilitate the organization of personal VR libraries and technical studies of systems automation.

## TLDR; Games on your VR in a few steps

1. Open the app and follow the **Initial Setup Wizard** to validate your session, dependencies (ADB/qBittorrent) and language.
2. Start the indexer to build your catalog.
3. Choose a game, download via qBitTorrent, and install on Quest via USB.

## Dynamic Features

### Rutracker Link Indexing

**Automated metadata capture directly from the original forum**

- Extraction of **Genre**, **Version**, **Developer**, and **Seeds/Leechers** statistics.
- **Multi-language System:** Interface available in **English (default)** and **Portuguese**, with dynamic switching in settings.
- **Flexible Translation:** Choose the destination language for game translations (English or Portuguese).
- **Optimized Interface:** Toggle button to hide/show the filter sidebar to focus on game viewing.

### Download Management

**Full integration with qBitTorrent Web UI**

- Remote control of downloads.
- Real-time progress monitoring directly in the library.
- Automatic synchronization between physical files on the HDD and the database.

### Sideloading

**Native installation via ADB (Android Debug Bridge)**

- Automated transfer of APK files and data folders (OBB).
- Support for multiple devices detected via USB.

## Installation (Manual)

> Warning: The project is in development phase and may contain bugs.

**Installation requires prior configuration of system dependencies. Follow the process below.**

<details>
<summary>Click to view the installation process</summary>

### 1. System Requirements

- **[Node.js](https://nodejs.org/):** Version 18.x or higher.
- **[qBitTorrent](https://www.qbittorrent.org/):** You must configure the **Web UI** for the app to manage downloads:
  1. Open qBitTorrent and go to `Tools` -> `Options` -> `Web UI`.
  2. Check the **Web User Interface (Remote Control)** box.
  3. In the **IP Address** field, use `127.0.0.1` and in the **Port**, use `8080` (project default).
  4. In **Authentication**, verify if the user is `admin`.
  5. **Password:** The project is configured to use the default password `adminadmin`. To use another one, you need to update the `loginQbit` function in the `backend/src/index.ts` file.
  6. (Optional) Check **Bypass authentication for clients on localhost** to simplify the connection.
- **[ADB (Android Debug Bridge)](https://developer.android.com/tools/adb):** The `adb` binary **MUST** be configured in the system's **PATH**.

### 2. Environment Configuration

Clone the repository and run the automated installer:

```powershell
git clone https://github.com/user/VRRookieDownloader.git
cd VRRookieDownloader
.\setup.bat
```

The setup script will check for Node.js and ADB in your PATH before installing project dependencies.

---

### Execution

To start the project:

```powershell
.\start.bat
```

_Run as Administrator if you want to use the local domain `http://vrrookie.local`._

</details>

## Usage Guide

### 1. Initial Configuration (Setup Wizard)

When you open the app for the first time, you'll be guided by the **Setup Wizard**. This automated process validates:

- **Language:** Interface preferences and library translation.
- **ADB:** Presence of the executable in the system PATH.
- **qBittorrent:** WebUI connection and process status.
- **RuTracker:** Authentication and session validity.
- **Directory:** Games folder path.

### 2. Catalog and Download

- **Search Customization:** You can change default search terms by editing `baseQueries` in `backend/src/scraper/worker.ts` (lines 231-235).
- Use the **Start Indexer** button (available at the end of Setup or in Settings) to fetch new titles from the forum.
- Click on the game card to open details and click **Download on Server**.
- The game will be automatically sent to your qBitTorrent.

### 3. Installation (Sideloading)

- Once the download is complete on your PC, connect your VR headset via USB.
- In the downloaded game's menu, click **Install on Quest**.
- The system will manage the APK and OBB file installation.

## Technical Stack

| Layer             | Technology                                       |
| :---------------- | :----------------------------------------------- |
| **Frontend**      | Next.js 15 (App Router), Tailwind CSS, Shadcn UI |
| **Backend**       | Node.js, Express, TypeScript                     |
| **Persistence**   | SQLite (Better-SQLite3)                          |
| **Automation**    | Puppeteer Stealth, Cheerio, ADB Tools            |
| **Communication** | Socket.io, React Query, Zustand                  |

---

_Manage your local VR library efficiently and automatically._
