# Zameen Property & Plot Contact Tracker - Chrome Extension

A Chrome Extension for property seekers on **Zameen.com**. Easily track which plots and properties you have already contacted, prevent duplicate calls/messages, add private notes (demands, agent names), sync in real-time with family members/partners via Firebase, and export your contacts to CSV (Excel).

---

## 🌟 Features

- **🔥 Real-Time Multi-User Cloud Sync (Firebase)**:
  - Both you and your brother/partner can browse Zameen at the same time.
  - When either of you marks a plot, writes a note, or contacts an agent, it **instantly turns green on both screens in under 1 second** without refreshing!
- **Direct In-Page Status Badges**:
  - Adds a **"Mark Contacted"** / **"✓ Contacted"** button right on each Zameen search result card.
  - Highlights contacted cards with a clean green border accent and a **"✓ CONTACTED"** top badge.
- **Auto-Detect WhatsApp & Call**:
  - Automatically marks a plot as contacted whenever you click the **"WhatsApp"** or **"Call"** buttons on Zameen!
  - Displays a quick non-intrusive toast with an **Undo** button in case you clicked by accident.
- **Quick Notes & Demands**:
  - Add private notes directly to any plot card (e.g., *"Agent: Tariq, Demand: 30 Lakh final, Plot #120"*).
- **Status Tags**:
  - Categorize plots into **Contacted**, **Follow-up**, or **Not Interested / Passed**.
- **Modern Popup Dashboard**:
  - View all saved plots in one organized dashboard.
  - Real-time search by Title, Property ID, Location, or Notes.
  - Filter by status tabs.
  - Instant link to open the listing on Zameen.com.
- **Excel & CSV Export**:
  - 1-Click export to CSV with Property ID, Title, Price, Location, Area, Status, Contact Method, Date, and Notes.
- **Backup & Restore**:
  - Export and restore JSON backups of your saved plots across devices or browsers.

---

## 🚀 How to Install in Chrome / Edge / Brave

1. Open your browser and go to the extensions page:
   - **Chrome**: Navigate to `chrome://extensions`
   - **Edge**: Navigate to `edge://extensions`
   - **Brave**: Navigate to `brave://extensions`
2. Enable **"Developer mode"** (toggle located in the top-right corner).
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select this folder:
   ```
   d:\projectts\zameen extension
   ```
5. The extension **"Zameen Property & Plot Contact Tracker"** is now installed! Pin it to your browser toolbar for quick access.

---

## 🔄 Setting Up Real-Time Sync (You & Your Brother)

1. Have your brother install the extension on his computer.
2. Click the extension icon in the toolbar, then click the **Settings (gear icon)** at the top right.
3. In the **Firebase Live Sync** section:
   - Paste your private Firebase Realtime Database URL (e.g. `https://your-project-id-default-rtdb.firebaseio.com`).
   - Turn ON the toggle switch.
4. Click **"Test Connection"** (it will say *"✓ Connected successfully to Firebase!"*).
5. Both extensions will now synchronize seamlessly in real time!

---

## 💡 How to Use

1. Open [Zameen.com](https://www.zameen.com/Plots/) and search for plots in any city or sector (e.g. Islamabad B-17, DHA, Bahria Town, etc.).
2. You will immediately see:
   - The **"Mark Contacted"** button on each listing card.
   - When you click **"WhatsApp"** or **"Call"**, the listing will automatically be marked as contacted.
3. Click **"Add Note"** on any card to record agent quotes or plot numbers.
4. Click the extension icon in your toolbar anytime to see your list of contacted plots, search them, or export them to Excel!

---

## 📂 Project Structure

```
zameen extension/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── icons/                     # Extension icons (16, 32, 48, 128)
├── content/
│   ├── content.js             # Injected script (card badges, auto-contact listeners)
│   └── content.css            # Styles for in-page badges, buttons, and popovers
├── popup/
│   ├── popup.html             # Extension dashboard popup UI with Cloud Sync
│   ├── popup.css              # Popup styling
│   └── popup.js               # Dashboard controller (search, filters, Firebase sync)
└── utils/
    ├── storage.js             # Chrome storage + Firebase Realtime SSE Live Sync
    └── extractor.js           # DOM parser for Zameen listing cards & detail pages
```
