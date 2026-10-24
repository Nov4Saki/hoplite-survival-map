# ⚔️ Hoplite Survival Interactive Map Explorer

A fast, interactive, high-performance web-based map application designed specifically for Minecraft Hoplite Survival maps.

Calibrated to the exact **-3,500 to +3,500** world coordinate scale along both the horizontal (**X**) and vertical (**Z**) axes.

---

## 🚀 Quick Start

1. **Direct Launch**:
   - Double-click [`start_map.bat`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/start_map.bat) to launch the interactive map in your default web browser.
   - Alternatively, simply open [`index.html`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/index.html) directly in any browser (Chrome, Edge, Firefox, Brave). No local server or dependencies are required.

---

## 🗺️ Key Features

### 1. Coordinate Scale & Calibration (-3,500 to +3,500)
- **Horizontal Axis (X)**: West (`-3,500`) to East (`+3,500`)
- **Vertical Axis (Z)**: North (`-3,500`) to South (`+3,500`)
- **Center**: `(0, 0)` perfectly aligned to the map center.
- **Spawn Calibration**: Matches the player position shown in the screenshot at `X: 127, Z: 123`.
- **Live Telemetry HUD**: Shows continuous real-time `X` and `Z` block coordinates under your mouse cursor, plus bearing angle and distance from your base.
- **Dynamic Scale Bar**: Automatically adjusts scale readout (50m, 100m, 250m, 500m, 1,000m, 2,000m) as you zoom in and out.

### 2. Three Structure Difficulty Types (Outlines & Badges)
The map contains **133 classified structures** extracted directly from the game terrain:
- 🟡 **Hard Structures (17 total)**: Outlined in **Bright Yellow** (`#ffdf20`). Major fortresses, castles, and large monuments.
- 🟣 **Medium Structures (28 total)**: Outlined in **Vivid Purple** (`#c058f5`). Outposts, watchtowers, and shrines.
- 🔵 **Easy Structures (88 total)**: Outlined in **Sky Blue / Cyan** (`#38bdf8`). Camps, huts, small ruins, and cabins.

### 3. Proximity Radar & Structure Finder
- **Real-Time Distance Sorting**: Dynamically lists every structure on the map sorted from nearest to furthest.
- **Dual Reference Points**: Switch distance calculations between:
  - `[📍 From Home Base]`
  - `[🧭 From Player Position]`
- **Tier Filters**: Filter the radar to show `All (133)`, `🟡 Hard (17)`, `🟣 Medium (28)`, or `🔵 Easy (88)`.
- **Search Engine**: Search by structure name, ID (e.g. `H-01`, `M-05`), or coordinate.
- **1-Click Fly-To**: Click any structure card in the sidebar to smoothly glide the camera straight to it.
- **Target Guidance Laser**: Clicking any structure draws a direct vector guideline from your base/player to the structure, showing exact distance in blocks and compass heading (e.g. `⚡ 686 blocks • ESE (112°)`).
- **Loot Tracker**: Mark structures as "Looted / Cleared" so you don't revisit cleared locations.

### 4. Home Base Management
- **One-Click Placement**: Click the `📍 Set Home Base` button on the top bar, then click anywhere on the terrain.
- **Right-Click Shortcut**: Right-click anywhere on the map and choose `"Set Home Base Here"`.
- **Manual Input**: Enter exact `X` and `Z` numbers in the *"Base & Coords"* tab.
- **Distance Rings**: Concentric translucent radar rings (`500m`, `1,000m`, `1,500m`, `2,000m`, `3,000m`) radiating outward from your Home Base.
- **Jump to Home**: One-click button or press `H` on your keyboard to instantly center on your base.

### 5. Player Location Tracking
- Track where you are during active Hoplite matches.
- Click `🧭 Set My Location` or right-click the map.
- Paste Minecraft F3 coordinates, chat cords, or `/tp` commands (e.g., `X: 127, Z: 123` or `/tp 127 70 123`) to auto-update your location.
- Live bearing & distance readout indicating how far you are from home and in what compass direction.

---

## ⌨️ Controls & Shortcuts

| Action | Control |
|---|---|
| **Pan Map** | Click and drag with mouse |
| **Zoom In / Out** | Mouse scroll wheel or `+` / `−` buttons |
| **Quick Zoom to Location** | Double-click anywhere on the map |
| **Context Menu** | Right-click anywhere on the map |
| **Jump to Home Base** | Press `H` or click `"Jump to Home"` |
| **Reset to Full World View** | Press `R` or click `"Full Map"` |
| **Deselect / Cancel Picking** | Press `Esc` |

---

## 📁 File Structure

- [`index.html`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/index.html): Web application entry point.
- [`styles.css`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/styles.css): Tactical dark HUD theme, badges, animations, and responsive styles.
- [`app.js`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/app.js): Coordinate engine, canvas renderer, radar calculations, and state management.
- [`structures_data.js`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/structures_data.js): Database of all 133 structures with verified coordinates and tiers.
- [`map_image_data.js`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/map_image_data.js): Base64-embedded map image ensuring 100% offline portability without CORS issues.
- [`map_cropped.png`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/map_cropped.png): Calibrated raw 990x990 map crop from the screenshot.
- [`start_map.bat`](file:///C:/projects/Minecraft/hoplite/survival%20map%20maker/start_map.bat): 1-click Windows batch launcher.
