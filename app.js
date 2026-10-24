/**
 * Hoplite Survival Map Explorer - Core Application Engine
 * Interactive coordinate-calibrated map with pan, zoom, radar, and home base management.
 */

(function () {
  'use strict';

  // --- Coordinate Calibration Constants ---
  // Outer map: 990x990 px. Inner terrain: x,y in [7.5, 982.5] (span: 975 px).
  // Minecraft world coordinates span from -3,500 to +3,500 (total span: 7,000 blocks).
  // Calibrated with screenshot: Player at X: 127, Z: 123 is at px (511.5, 511.5).
  const MAP_PX_WIDTH = 990;
  const MAP_PX_HEIGHT = 990;
  const CENTER_PX_X = 493.81;
  const CENTER_PX_Y = 494.37;
  const TERRAIN_SPAN_PX = 975.0;
  const WORLD_SPAN_MC = 7000.0;
  const BLOCK_PER_PX = WORLD_SPAN_MC / TERRAIN_SPAN_PX; // ~7.179487
  const PX_PER_BLOCK = TERRAIN_SPAN_PX / WORLD_SPAN_MC; // ~0.1392857

  // Coordinate Conversion Functions
  function mcToPx(mcX, mcZ) {
    return {
      x: CENTER_PX_X + mcX * PX_PER_BLOCK,
      y: CENTER_PX_Y + mcZ * PX_PER_BLOCK
    };
  }

  function pxToMc(pxX, pxY) {
    return {
      x: Math.round((pxX - CENTER_PX_X) * BLOCK_PER_PX),
      z: Math.round((pxY - CENTER_PX_Y) * BLOCK_PER_PX)
    };
  }

  function calcDistance(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return Math.round(Math.sqrt(dx * dx + dz * dz));
  }

  function calcBearing(fromX, fromZ, toX, toZ) {
    const dx = toX - fromX;
    const dz = toZ - fromZ; // In Minecraft, North is -Z, South is +Z
    // In standard compass, 0 deg = North (-Z), 90 deg = East (+X), 180 deg = South (+Z), 270 deg = West (-X)
    let deg = Math.atan2(dx, -dz) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    
    const cardinals = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const idx = Math.round(deg / 22.5) % 16;
    const arrows = ["↑", "↗", "↗", "↗", "→", "↘", "↘", "↘", "↓", "↙", "↙", "↙", "←", "↖", "↖", "↖"];
    return {
      deg: Math.round(deg),
      cardinal: cardinals[idx],
      arrow: arrows[idx]
    };
  }

  // --- Application State ---
  const state = {
    // Camera
    cameraX: CENTER_PX_X,
    cameraY: CENTER_PX_Y,
    zoom: 1.0,
    minZoom: 0.45,
    maxZoom: 16.0,

    // Reference Coordinates
    homeBase: null, // { x: mc_x, z: mc_z }
    playerPosition: { x: 127, z: 123 }, // Default starting position from screenshot

    // Active Modes
    pickMode: null, // 'home' | 'player' | null
    activeReference: 'home', // 'home' | 'player'
    selectedStructure: null,
    hoveredStructure: null,

    // Filters
    tierFilter: 'all',
    searchQuery: '',

    // Layers Visibility
    layers: {
      hard: true,
      medium: true,
      easy: true,
      grid: true,
      rings: true,
      guidance: true,
      badges: true,
      pixelated: true
    },

    // Looted / Cleared Structures (IDs)
    lootedStructures: new Set(),

    // Custom Waypoints
    waypoints: [],

    // Cursor position in Minecraft coords
    cursorMc: { x: 0, z: 0 },
    cursorPx: { x: 0, y: 0 }
  };

  // --- Load and Save State ---
  function loadSavedState() {
    try {
      const savedHome = localStorage.getItem('hoplite_home_base');
      if (savedHome) state.homeBase = JSON.parse(savedHome);

      const savedPlayer = localStorage.getItem('hoplite_player_pos');
      if (savedPlayer) state.playerPosition = JSON.parse(savedPlayer);

      const savedLooted = localStorage.getItem('hoplite_looted');
      if (savedLooted) state.lootedStructures = new Set(JSON.parse(savedLooted));

      const savedWaypoints = localStorage.getItem('hoplite_waypoints');
      if (savedWaypoints) state.waypoints = JSON.parse(savedWaypoints);

      const savedLayers = localStorage.getItem('hoplite_layers');
      if (savedLayers) {
        state.layers = Object.assign(state.layers, JSON.parse(savedLayers));
      }
    } catch (e) {
      console.warn("Could not load local storage", e);
    }
  }

  function saveState() {
    try {
      if (state.homeBase) {
        localStorage.setItem('hoplite_home_base', JSON.stringify(state.homeBase));
      } else {
        localStorage.removeItem('hoplite_home_base');
      }
      localStorage.setItem('hoplite_player_pos', JSON.stringify(state.playerPosition));
      localStorage.setItem('hoplite_looted', JSON.stringify(Array.from(state.lootedStructures)));
      localStorage.setItem('hoplite_waypoints', JSON.stringify(state.waypoints));
      localStorage.setItem('hoplite_layers', JSON.stringify(state.layers));
    } catch (e) {
      console.warn("Could not save to local storage", e);
    }
  }

  // --- DOM Elements ---
  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWrapper = document.getElementById('canvasWrapper');

  const headerCursorCoords = document.getElementById('headerCursorCoords');
  const headerDistance = document.getElementById('headerDistance');
  const headerHomeStatus = document.getElementById('headerHomeStatus');

  const hudX = document.getElementById('hudX');
  const hudZ = document.getElementById('hudZ');
  const hudBearingDisplay = document.getElementById('hudBearingDisplay');

  const scaleBarText = document.getElementById('scaleBarText');
  const scaleBarLine = document.getElementById('scaleBarLine');

  const btnPickHome = document.getElementById('btnPickHome');
  const btnPickPlayer = document.getElementById('btnPickPlayer');
  const btnZoomHome = document.getElementById('btnZoomHome');
  const btnResetView = document.getElementById('btnResetView');

  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnRecenter = document.getElementById('btnRecenter');

  const structureListEl = document.getElementById('structureList');
  const totalVisibleCountEl = document.getElementById('totalVisibleCount');
  const searchInput = document.getElementById('searchInput');

  const refFromHomeBtn = document.getElementById('refFromHome');
  const refFromPlayerBtn = document.getElementById('refFromPlayer');

  const homeXInput = document.getElementById('homeXInput');
  const homeZInput = document.getElementById('homeZInput');
  const btnSaveHomeManual = document.getElementById('btnSaveHomeManual');
  const btnPickHomeSidebar = document.getElementById('btnPickHomeSidebar');
  const btnClearHome = document.getElementById('btnClearHome');
  const baseStatusBadge = document.getElementById('baseStatusBadge');

  const playerXInput = document.getElementById('playerXInput');
  const playerZInput = document.getElementById('playerZInput');
  const f3PasteInput = document.getElementById('f3PasteInput');
  const btnSavePlayerManual = document.getElementById('btnSavePlayerManual');
  const btnPickPlayerSidebar = document.getElementById('btnPickPlayerSidebar');
  const playerHomeTelemetry = document.getElementById('playerHomeTelemetry');

  const mapTooltip = document.getElementById('mapTooltip');
  const tooltipTier = document.getElementById('tooltipTier');
  const tooltipName = document.getElementById('tooltipName');
  const tooltipCoords = document.getElementById('tooltipCoords');
  const tooltipDist = document.getElementById('tooltipDist');

  const contextMenu = document.getElementById('contextMenu');
  const ctxSetHome = document.getElementById('ctxSetHome');
  const ctxSetPlayer = document.getElementById('ctxSetPlayer');
  const ctxAddWaypoint = document.getElementById('ctxAddWaypoint');
  const ctxCopyCoords = document.getElementById('ctxCopyCoords');
  const ctxCopyTp = document.getElementById('ctxCopyTp');
  let contextMenuTargetMc = { x: 0, z: 0 };

  const toastContainer = document.getElementById('toastContainer');

  // --- Map Image Loading ---
  const mapImage = new Image();
  let mapImageLoaded = false;

  if (window.MAP_IMAGE_SRC) {
    mapImage.src = window.MAP_IMAGE_SRC;
  } else {
    mapImage.src = 'map_cropped.png';
  }

  mapImage.onload = function () {
    mapImageLoaded = true;
    fitMapToView();
    requestRender();
  };

  mapImage.onerror = function () {
    console.error("Failed to load map image");
    showToast("⚠️ Could not load map image. Make sure map_cropped.png is present.", 4000);
  };

  // --- Data structures ---
  const structures = window.HOPLITE_STRUCTURES || [];

  // --- Canvas Resizing & Transform ---
  let canvasWidth = 0;
  let canvasHeight = 0;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    const rect = canvasWrapper.getBoundingClientRect();
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    requestRender();
  }

  window.addEventListener('resize', resizeCanvas);

  function worldToScreen(mapPxX, mapPxY) {
    return {
      x: (mapPxX - state.cameraX) * state.zoom + canvasWidth / 2,
      y: (mapPxY - state.cameraY) * state.zoom + canvasHeight / 2
    };
  }

  function screenToWorld(screenX, screenY) {
    return {
      x: (screenX - canvasWidth / 2) / state.zoom + state.cameraX,
      y: (screenY - canvasHeight / 2) / state.zoom + state.cameraY
    };
  }

  function fitMapToView() {
    const pad = 60;
    const availW = canvasWidth - pad * 2;
    const availH = canvasHeight - pad * 2;
    const scale = Math.min(availW / MAP_PX_WIDTH, availH / MAP_PX_HEIGHT, 1.2);
    state.zoom = Math.max(state.minZoom, scale);
    state.cameraX = CENTER_PX_X;
    state.cameraY = CENTER_PX_Y;
    requestRender();
  }

  // --- Animation Engine ---
  let renderRequested = false;
  function requestRender() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  let animationId = null;
  function flyTo(targetMcX, targetMcZ, targetZoom = 3.5, duration = 400) {
    if (animationId) cancelAnimationFrame(animationId);
    
    const targetPx = mcToPx(targetMcX, targetMcZ);
    const startX = state.cameraX;
    const startY = state.cameraY;
    const startZoom = state.zoom;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      state.cameraX = startX + (targetPx.x - startX) * ease;
      state.cameraY = startY + (targetPx.y - startY) * ease;
      state.zoom = startZoom + (targetZoom - startZoom) * ease;

      requestRender();

      if (t < 1) {
        animationId = requestAnimationFrame(step);
      } else {
        animationId = null;
      }
    }

    animationId = requestAnimationFrame(step);
  }

  // Pulse animation for selected/highlighted markers
  let pulseTimer = 0;
  function updatePulse() {
    pulseTimer = (Date.now() / 300) % (Math.PI * 2);
    if (state.selectedStructure) {
      requestRender();
    }
  }
  setInterval(updatePulse, 50);

  // --- Toast Notifications ---
  function showToast(message, duration = 2500) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // --- Main Rendering Routine ---
  function render() {
    renderRequested = false;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#080b11';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.imageSmoothingEnabled = !state.layers.pixelated;

    // 1. Draw Map Image
    if (mapImageLoaded) {
      const topLeft = worldToScreen(0, 0);
      const width = MAP_PX_WIDTH * state.zoom;
      const height = MAP_PX_HEIGHT * state.zoom;

      // Draw subtle shadow behind map
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 30 * Math.min(state.zoom, 1);
      ctx.drawImage(mapImage, topLeft.x, topLeft.y, width, height);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // 2. Draw World Boundaries (-3500 to +3500)
    const tlWorld = mcToPx(-3500, -3500);
    const brWorld = mcToPx(3500, 3500);
    const tlScreen = worldToScreen(tlWorld.x, tlWorld.y);
    const brScreen = worldToScreen(brWorld.x, brWorld.y);
    const worldW = brScreen.x - tlScreen.x;
    const worldH = brScreen.y - tlScreen.y;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = Math.max(1.5, 2 * (state.zoom / 2));
    ctx.strokeRect(tlScreen.x, tlScreen.y, worldW, worldH);

    // 3. Draw Coordinate Grid & Axis Numbers
    if (state.layers.grid) {
      drawCoordinateGrid(tlScreen, brScreen);
    }

    // 4. Draw Home Base Distance Rings
    if (state.layers.rings && state.homeBase) {
      drawDistanceRings();
    }

    // 5. Draw Guidance / Vector Line to selected target
    if (state.layers.guidance && state.selectedStructure) {
      drawGuidanceLine();
    }

    // 6. Draw Structures
    drawStructures();

    // 7. Draw Custom Waypoints
    drawWaypoints();

    // 8. Draw Player Marker
    drawPlayerMarker();

    // 9. Draw Home Base Marker
    if (state.homeBase) {
      drawHomeBaseMarker();
    }

    ctx.restore();

    // Update Floating Scale Bar
    updateScaleBar();
  }

  // --- Drawing Subroutines ---

  function drawCoordinateGrid(tlScreen, brScreen) {
    // Determine grid step in Minecraft blocks
    let step = 1000;
    if (state.zoom > 5.0) step = 250;
    else if (state.zoom > 2.2) step = 500;

    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Vertical lines (along X axis)
    for (let mcX = -3000; mcX <= 3000; mcX += step) {
      const px = mcToPx(mcX, 0);
      const scr = worldToScreen(px.x, 0);

      const isZero = mcX === 0;
      ctx.strokeStyle = isZero ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isZero ? 1.5 : 1;

      ctx.beginPath();
      ctx.moveTo(scr.x, tlScreen.y);
      ctx.lineTo(scr.x, brScreen.y);
      ctx.stroke();

      // Label at top & bottom
      if (scr.x >= 20 && scr.x <= canvasWidth - 20) {
        ctx.fillStyle = isZero ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)';
        const labelText = `X:${mcX}`;
        ctx.fillText(labelText, scr.x, Math.max(14, tlScreen.y - 10));
      }
    }

    // Horizontal lines (along Z axis)
    for (let mcZ = -3000; mcZ <= 3000; mcZ += step) {
      const py = mcToPx(0, mcZ);
      const scr = worldToScreen(0, py.y);

      const isZero = mcZ === 0;
      ctx.strokeStyle = isZero ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isZero ? 1.5 : 1;

      ctx.beginPath();
      ctx.moveTo(tlScreen.x, scr.y);
      ctx.lineTo(brScreen.x, scr.y);
      ctx.stroke();

      // Label at left & right
      if (scr.y >= 20 && scr.y <= canvasHeight - 20) {
        ctx.fillStyle = isZero ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = 'right';
        const labelText = `Z:${mcZ}`;
        ctx.fillText(labelText, Math.max(35, tlScreen.x - 8), scr.y);
      }
    }

    // Cardinal Direction Badges on World Border
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';

    // North (Top)
    const midX = (tlScreen.x + brScreen.x) / 2;
    ctx.fillText('▲ NORTH (-Z)', midX, Math.max(16, tlScreen.y - 24));

    // South (Bottom)
    ctx.fillText('▼ SOUTH (+Z)', midX, Math.min(canvasHeight - 16, brScreen.y + 24));

    // West (Left)
    const midY = (tlScreen.y + brScreen.y) / 2;
    ctx.textAlign = 'right';
    ctx.fillText('◄ WEST (-X)', Math.max(40, tlScreen.x - 12), midY);

    // East (Right)
    ctx.textAlign = 'left';
    ctx.fillText('EAST (+X) ►', Math.min(canvasWidth - 40, brScreen.x + 12), midY);
  }

  function drawDistanceRings() {
    const homePx = mcToPx(state.homeBase.x, state.homeBase.z);
    const homeScr = worldToScreen(homePx.x, homePx.y);

    const radiiBlocks = [500, 1000, 1500, 2000, 3000];
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';

    radiiBlocks.forEach(radius => {
      const radiusPx = radius * PX_PER_BLOCK * state.zoom;
      if (radiusPx < 5) return;

      // Circle
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(homeScr.x, homeScr.y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.fillText(`${radius}m`, homeScr.x + radiusPx + 4, homeScr.y);
    });
  }

  function drawGuidanceLine() {
    const ref = state.activeReference === 'home' && state.homeBase ? state.homeBase : state.playerPosition;
    if (!ref) return;

    const refPx = mcToPx(ref.x, ref.z);
    const refScr = worldToScreen(refPx.x, refPx.y);

    const st = state.selectedStructure;
    const stPx = mcToPx(st.mc_x, st.mc_z);
    const stScr = worldToScreen(stPx.x, stPx.y);

    // Draw Laser guideline
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(refScr.x, refScr.y);
    ctx.lineTo(stScr.x, stScr.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Draw Distance tag in middle of line
    const midX = (refScr.x + stScr.x) / 2;
    const midY = (refScr.y + stScr.y) / 2;
    const dist = calcDistance(ref.x, ref.z, st.mc_x, st.mc_z);
    const bearing = calcBearing(ref.x, ref.z, st.mc_x, st.mc_z);
    const tagText = `⚡ ${dist} blocks • ${bearing.cardinal} (${bearing.deg}°)`;

    ctx.font = 'bold 11px ui-monospace, monospace';
    const textW = ctx.measureText(tagText).width;

    ctx.fillStyle = 'rgba(10, 13, 20, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(midX - textW / 2 - 8, midY - 12, textW + 16, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, midX, midY);

    ctx.restore();
  }

  function drawStructures() {
    const isBadgesEnabled = state.layers.badges;

    structures.forEach(st => {
      // Check tier toggle
      if (st.tier === 'hard' && !state.layers.hard) return;
      if (st.tier === 'medium' && !state.layers.medium) return;
      if (st.tier === 'easy' && !state.layers.easy) return;

      const pxPos = mcToPx(st.mc_x, st.mc_z);
      const scr = worldToScreen(pxPos.x, pxPos.y);

      // Frustum culling: Skip if far outside screen
      if (scr.x < -80 || scr.x > canvasWidth + 80 || scr.y < -80 || scr.y > canvasHeight + 80) {
        return;
      }

      const isSelected = state.selectedStructure && state.selectedStructure.id === st.id;
      const isHovered = state.hoveredStructure && state.hoveredStructure.id === st.id;
      const isLooted = state.lootedStructures.has(st.id);

      // Tier styling
      let primaryColor = '#ffdf20';
      let tierIcon = '🟡';
      let baseRadius = 6;

      if (st.tier === 'medium') {
        primaryColor = '#c058f5';
        tierIcon = '🟣';
        baseRadius = 5;
      } else if (st.tier === 'easy') {
        primaryColor = '#38bdf8';
        tierIcon = '🔵';
        baseRadius = 4;
      }

      ctx.save();

      if (isLooted) {
        ctx.globalAlpha = 0.4;
      }

      // Draw structure outline box if zoomed in
      if (st.bbox_px && state.zoom >= 1.5) {
        const minScr = worldToScreen(st.bbox_px[0], st.bbox_px[1]);
        const maxScr = worldToScreen(st.bbox_px[2] + 1, st.bbox_px[3] + 1);
        const boxW = Math.max(8, maxScr.x - minScr.x);
        const boxH = Math.max(8, maxScr.y - minScr.y);

        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.min(3, Math.max(1.5, state.zoom * 0.8));
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = isSelected ? 12 : 4;
        ctx.strokeRect(minScr.x - 2, minScr.y - 2, boxW + 4, boxH + 4);
        ctx.shadowBlur = 0;
      }

      // Marker Badge / Pin
      if (isBadgesEnabled) {
        const markerRadius = Math.max(baseRadius, baseRadius * Math.min(2.5, state.zoom * 0.8));

        // Pulsing halo for selected marker
        if (isSelected) {
          const pulse = (Math.sin(pulseTimer) + 1) / 2;
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, markerRadius + 6 + pulse * 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Marker circle
        ctx.fillStyle = isHovered ? '#fff' : primaryColor;
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, markerRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#0a0d14';
        ctx.lineWidth = 2;
        ctx.stroke();

        // When zoomed in, draw a label tag
        if (state.zoom >= 2.5 || isSelected || isHovered) {
          const label = `${st.id}`;
          ctx.font = 'bold 10px ui-monospace, monospace';
          const tw = ctx.measureText(label).width;

          ctx.fillStyle = 'rgba(10, 13, 20, 0.85)';
          ctx.beginPath();
          ctx.roundRect(scr.x - tw / 2 - 4, scr.y - markerRadius - 16, tw + 8, 14, 4);
          ctx.fill();
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, scr.x, scr.y - markerRadius - 9);
        }
      }

      ctx.restore();
    });
  }

  function drawHomeBaseMarker() {
    const px = mcToPx(state.homeBase.x, state.homeBase.z);
    const scr = worldToScreen(px.x, px.y);

    ctx.save();

    // Pulsing golden aura
    const pulse = (Math.sin(pulseTimer) + 1) / 2;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 16 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();

    // Beacon beam upwards
    const grad = ctx.createLinearGradient(scr.x, scr.y, scr.x, scr.y - 60);
    grad.addColorStop(0, 'rgba(245, 158, 11, 0.8)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(scr.x - 3, scr.y - 60, 6, 60);

    // Home pin
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Home Icon badge
    ctx.fillStyle = '#000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏰', scr.x, scr.y);

    // Label tag
    const tag = `HOME BASE [${state.homeBase.x}, ${state.homeBase.z}]`;
    ctx.font = 'bold 11px ui-monospace, monospace';
    const tw = ctx.measureText(tag).width;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.95)';
    ctx.beginPath();
    ctx.roundRect(scr.x - tw / 2 - 6, scr.y + 14, tw + 12, 18, 5);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.fillText(tag, scr.x, scr.y + 23);

    ctx.restore();
  }

  function drawPlayerMarker() {
    const px = mcToPx(state.playerPosition.x, state.playerPosition.z);
    const scr = worldToScreen(px.x, px.y);

    ctx.save();

    // Green pulse
    const pulse = (Math.cos(pulseTimer) + 1) / 2;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 14 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();

    // Player Pin
    ctx.fillStyle = '#10b981';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Player Icon
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲', scr.x, scr.y - 1);

    // Label tag
    const tag = `YOU [${state.playerPosition.x}, ${state.playerPosition.z}]`;
    ctx.font = 'bold 10px ui-monospace, monospace';
    const tw = ctx.measureText(tag).width;

    ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
    ctx.beginPath();
    ctx.roundRect(scr.x - tw / 2 - 6, scr.y + 12, tw + 12, 16, 4);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.fillText(tag, scr.x, scr.y + 20);

    ctx.restore();
  }

  function drawWaypoints() {
    state.waypoints.forEach(wp => {
      const px = mcToPx(wp.x, wp.z);
      const scr = worldToScreen(px.x, px.y);

      ctx.save();
      ctx.fillStyle = wp.color || '#ec4899';
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.font = '10px sans-serif';
      const tw = ctx.measureText(wp.name).width;
      ctx.fillStyle = 'rgba(10, 13, 20, 0.8)';
      ctx.beginPath();
      ctx.roundRect(scr.x - tw / 2 - 4, scr.y - 18, tw + 8, 14, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wp.name, scr.x, scr.y - 11);
      ctx.restore();
    });
  }

  function updateScaleBar() {
    // We want a bar that represents around 100 screen pixels
    const blocksIn100Px = 100 / (PX_PER_BLOCK * state.zoom);
    
    // Pick round number: 100, 250, 500, 1000, 2000, 3000
    const steps = [50, 100, 250, 500, 1000, 2000, 3000];
    let chosenStep = 500;
    for (let s of steps) {
      if (s >= blocksIn100Px * 0.7) {
        chosenStep = s;
        break;
      }
    }

    const barPixelWidth = Math.round(chosenStep * PX_PER_BLOCK * state.zoom);
    scaleBarLine.style.width = `${barPixelWidth}px`;
    scaleBarText.textContent = `${chosenStep} Blocks`;
  }

  // --- Interaction: Pan & Zoom ---
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let camStartX = 0;
  let camStartY = 0;

  canvasWrapper.addEventListener('mousedown', function (e) {
    if (e.button === 0) { // Left click
      // Handle pick mode if active
      if (state.pickMode) {
        const rect = canvasWrapper.getBoundingClientRect();
        const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const mcPos = pxToMc(worldPos.x, worldPos.y);

        if (state.pickMode === 'home') {
          setHomeBase(mcPos.x, mcPos.z);
          showToast(`🏰 Home Base set to X: ${mcPos.x}, Z: ${mcPos.z}`);
        } else if (state.pickMode === 'player') {
          setPlayerPosition(mcPos.x, mcPos.z);
          showToast(`🧭 Player Position set to X: ${mcPos.x}, Z: ${mcPos.z}`);
        }
        setPickMode(null);
        return;
      }

      // Check structure hit
      const clickedStruct = getStructureAtScreenPos(e.clientX, e.clientY);
      if (clickedStruct) {
        selectStructure(clickedStruct);
        return;
      }

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      camStartX = state.cameraX;
      camStartY = state.cameraY;
    }
  });

  window.addEventListener('mousemove', function (e) {
    const rect = canvasWrapper.getBoundingClientRect();
    const scrX = e.clientX - rect.left;
    const scrY = e.clientY - rect.top;

    // Update cursor telemetry
    if (scrX >= 0 && scrX <= canvasWidth && scrY >= 0 && scrY <= canvasHeight) {
      const worldPos = screenToWorld(scrX, scrY);
      state.cursorPx = worldPos;
      state.cursorMc = pxToMc(worldPos.x, worldPos.y);

      // Clamp or show
      updateCursorTelemetry();

      // Check structure hover
      if (!isDragging && !state.pickMode) {
        const hovered = getStructureAtScreenPos(e.clientX, e.clientY);
        if (hovered !== state.hoveredStructure) {
          state.hoveredStructure = hovered;
          updateStructureTooltip(e.clientX, e.clientY, hovered);
          requestRender();
        } else if (hovered) {
          updateStructureTooltip(e.clientX, e.clientY, hovered);
        }
      }
    } else {
      mapTooltip.style.display = 'none';
      state.hoveredStructure = null;
    }

    if (isDragging) {
      const dx = (e.clientX - dragStartX) / state.zoom;
      const dy = (e.clientY - dragStartY) / state.zoom;
      state.cameraX = camStartX - dx;
      state.cameraY = camStartY - dy;
      requestRender();
    }
  });

  window.addEventListener('mouseup', function (e) {
    if (isDragging) {
      isDragging = false;
    }
  });

  // Wheel Zoom (Zoom around mouse position)
  canvasWrapper.addEventListener('wheel', function (e) {
    e.preventDefault();

    const rect = canvasWrapper.getBoundingClientRect();
    const mouseScrX = e.clientX - rect.left;
    const mouseScrY = e.clientY - rect.top;

    // Get world pos before zoom
    const worldBefore = screenToWorld(mouseScrX, mouseScrY);

    const zoomFactor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const newZoom = Math.min(state.maxZoom, Math.max(state.minZoom, state.zoom * zoomFactor));

    if (newZoom !== state.zoom) {
      state.zoom = newZoom;
      // Adjust camera so worldBefore stays under mouse
      state.cameraX = worldBefore.x - (mouseScrX - canvasWidth / 2) / state.zoom;
      state.cameraY = worldBefore.y - (mouseScrY - canvasHeight / 2) / state.zoom;
      requestRender();
    }
  }, { passive: false });

  // Double Click to Zoom In
  canvasWrapper.addEventListener('dblclick', function (e) {
    const rect = canvasWrapper.getBoundingClientRect();
    const mouseScrX = e.clientX - rect.left;
    const mouseScrY = e.clientY - rect.top;
    const world = screenToWorld(mouseScrX, mouseScrY);
    const mc = pxToMc(world.x, world.y);

    flyTo(mc.x, mc.z, Math.min(state.maxZoom, state.zoom * 2));
  });

  // Right-click Context Menu
  canvasWrapper.addEventListener('contextmenu', function (e) {
    e.preventDefault();

    const rect = canvasWrapper.getBoundingClientRect();
    const scrX = e.clientX - rect.left;
    const scrY = e.clientY - rect.top;
    const worldPos = screenToWorld(scrX, scrY);
    contextMenuTargetMc = pxToMc(worldPos.x, worldPos.y);

    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = 'flex';
  });

  window.addEventListener('click', function (e) {
    if (!contextMenu.contains(e.target)) {
      contextMenu.style.display = 'none';
    }
  });

  // Context Menu Actions
  ctxSetHome.addEventListener('click', function () {
    setHomeBase(contextMenuTargetMc.x, contextMenuTargetMc.z);
    contextMenu.style.display = 'none';
    showToast(`🏰 Home Base set to X: ${contextMenuTargetMc.x}, Z: ${contextMenuTargetMc.z}`);
  });

  ctxSetPlayer.addEventListener('click', function () {
    setPlayerPosition(contextMenuTargetMc.x, contextMenuTargetMc.z);
    contextMenu.style.display = 'none';
    showToast(`🧭 Player Position set to X: ${contextMenuTargetMc.x}, Z: ${contextMenuTargetMc.z}`);
  });

  ctxAddWaypoint.addEventListener('click', function () {
    const name = prompt("Enter Waypoint Name:", `Point (${contextMenuTargetMc.x}, ${contextMenuTargetMc.z})`);
    if (name) {
      addWaypoint(name, contextMenuTargetMc.x, contextMenuTargetMc.z);
    }
    contextMenu.style.display = 'none';
  });

  ctxCopyCoords.addEventListener('click', function () {
    const text = `${contextMenuTargetMc.x}, ${contextMenuTargetMc.z}`;
    navigator.clipboard.writeText(text);
    contextMenu.style.display = 'none';
    showToast(`📋 Copied Coordinates: ${text}`);
  });

  ctxCopyTp.addEventListener('click', function () {
    const cmd = `/tp @s ${contextMenuTargetMc.x} ~ ${contextMenuTargetMc.z}`;
    navigator.clipboard.writeText(cmd);
    contextMenu.style.display = 'none';
    showToast(`⚡ Copied command: <code>${cmd}</code>`);
  });

  // --- Hit Testing ---
  function getStructureAtScreenPos(clientX, clientY) {
    const rect = canvasWrapper.getBoundingClientRect();
    const scrX = clientX - rect.left;
    const scrY = clientY - rect.top;

    for (let i = structures.length - 1; i >= 0; i--) {
      const st = structures[i];
      if (st.tier === 'hard' && !state.layers.hard) continue;
      if (st.tier === 'medium' && !state.layers.medium) continue;
      if (st.tier === 'easy' && !state.layers.easy) continue;

      const pxPos = mcToPx(st.mc_x, st.mc_z);
      const stScr = worldToScreen(pxPos.x, pxPos.y);

      // Hit radius depends on size or badge
      let hitRadius = 14;
      if (st.size_px) {
        const w = (st.size_px[0] * state.zoom) / 2;
        const h = (st.size_px[1] * state.zoom) / 2;
        hitRadius = Math.max(hitRadius, Math.max(w, h) + 4);
      }

      const dx = scrX - stScr.x;
      const dy = scrY - stScr.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return st;
      }
    }
    return null;
  }

  function updateStructureTooltip(clientX, clientY, st) {
    if (!st) {
      mapTooltip.style.display = 'none';
      return;
    }

    const ref = state.activeReference === 'home' && state.homeBase ? state.homeBase : state.playerPosition;
    const dist = ref ? calcDistance(ref.x, ref.z, st.mc_x, st.mc_z) : null;
    const bearing = ref ? calcBearing(ref.x, ref.z, st.mc_x, st.mc_z) : null;

    let tierColor = '#ffdf20';
    if (st.tier === 'medium') tierColor = '#c058f5';
    if (st.tier === 'easy') tierColor = '#38bdf8';

    tooltipTier.textContent = st.tierLabel;
    tooltipTier.style.color = tierColor;
    tooltipName.textContent = st.name;
    tooltipCoords.textContent = `X: ${st.mc_x}, Z: ${st.mc_z}`;

    if (dist !== null) {
      const refName = state.activeReference === 'home' ? 'Home' : 'Player';
      tooltipDist.textContent = `⚡ ${dist}m from ${refName} • ${bearing.cardinal} (${bearing.deg}°)`;
    } else {
      tooltipDist.textContent = `Set Home Base for distance`;
    }

    mapTooltip.style.display = 'flex';
    mapTooltip.style.left = `${clientX + 16}px`;
    mapTooltip.style.top = `${clientY + 16}px`;
  }

  function selectStructure(st) {
    state.selectedStructure = st;
    requestRender();
    updateStructureListSelection();

    // Fly camera smoothly to structure
    flyTo(st.mc_x, st.mc_z, Math.max(state.zoom, 3.5));

    // Also update telemetry
    updateCursorTelemetry();
  }

  // --- Telemetry & Coords Updates ---
  function updateCursorTelemetry() {
    const x = state.cursorMc.x;
    const z = state.cursorMc.z;

    headerCursorCoords.textContent = `X: ${x}, Z: ${z}`;
    hudX.textContent = `X: ${x}`;
    hudZ.textContent = `Z: ${z}`;

    const ref = state.activeReference === 'home' && state.homeBase ? state.homeBase : state.playerPosition;
    if (ref) {
      const dist = calcDistance(ref.x, ref.z, x, z);
      const bearing = calcBearing(ref.x, ref.z, x, z);
      headerDistance.textContent = `${dist} blocks`;
      hudBearingDisplay.textContent = `Heading: ${bearing.cardinal} (${bearing.deg}°) | Ref: ${state.activeReference === 'home' ? 'Home Base' : 'Player'}`;
    } else {
      headerDistance.textContent = `-- blocks`;
      hudBearingDisplay.textContent = `Heading: -- | Set Home Base`;
    }
  }

  // --- Home Base & Player Position ---
  function setHomeBase(x, z) {
    state.homeBase = { x: parseInt(x), z: parseInt(z) };
    saveState();
    updateHomeBaseUI();
    updateRadarList();
    requestRender();
  }

  function clearHomeBase() {
    state.homeBase = null;
    saveState();
    updateHomeBaseUI();
    updateRadarList();
    requestRender();
    showToast("🗑️ Home Base cleared");
  }

  function setPlayerPosition(x, z) {
    state.playerPosition = { x: parseInt(x), z: parseInt(z) };
    saveState();
    updatePlayerUI();
    updateRadarList();
    requestRender();
  }

  function updateHomeBaseUI() {
    if (state.homeBase) {
      headerHomeStatus.textContent = `X: ${state.homeBase.x}, Z: ${state.homeBase.z}`;
      headerHomeStatus.style.color = '#fbbf24';
      baseStatusBadge.textContent = 'CONFIGURED';
      baseStatusBadge.style.color = '#34d399';
      baseStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
      homeXInput.value = state.homeBase.x;
      homeZInput.value = state.homeBase.z;
    } else {
      headerHomeStatus.textContent = 'Not Set';
      headerHomeStatus.style.color = '#94a3b8';
      baseStatusBadge.textContent = 'NOT SET';
      baseStatusBadge.style.color = '#fbbf24';
      baseStatusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      homeXInput.value = '';
      homeZInput.value = '';
    }

    // Telemetry between Player and Home
    if (state.homeBase && state.playerPosition) {
      const dist = calcDistance(state.playerPosition.x, state.playerPosition.z, state.homeBase.x, state.homeBase.z);
      const bearing = calcBearing(state.playerPosition.x, state.playerPosition.z, state.homeBase.x, state.homeBase.z);
      playerHomeTelemetry.style.display = 'block';
      playerHomeTelemetry.innerHTML = `🏠 <strong>Home Base is ${dist} blocks away</strong> (Heading: ${bearing.cardinal} ${bearing.arrow} ${bearing.deg}°)`;
    } else {
      playerHomeTelemetry.style.display = 'none';
    }
  }

  function updatePlayerUI() {
    playerXInput.value = state.playerPosition.x;
    playerZInput.value = state.playerPosition.z;
    updateHomeBaseUI();
  }

  function setPickMode(mode) {
    state.pickMode = mode;
    if (mode === 'home') {
      canvasWrapper.classList.add('picking-home');
      canvasWrapper.classList.remove('picking-player');
      btnPickHome.classList.add('active');
      btnPickPlayer.classList.remove('active');
      showToast("📍 Click anywhere on the map to set your Home Base");
    } else if (mode === 'player') {
      canvasWrapper.classList.add('picking-player');
      canvasWrapper.classList.remove('picking-home');
      btnPickPlayer.classList.add('active');
      btnPickHome.classList.remove('active');
      showToast("🧭 Click anywhere on the map to update your Location");
    } else {
      canvasWrapper.classList.remove('picking-home');
      canvasWrapper.classList.remove('picking-player');
      btnPickHome.classList.remove('active');
      btnPickPlayer.classList.remove('active');
    }
  }

  // --- Custom Waypoints ---
  function addWaypoint(name, x, z) {
    const wp = {
      id: `wp_${Date.now()}`,
      name: name,
      x: parseInt(x),
      z: parseInt(z),
      color: '#ec4899'
    };
    state.waypoints.push(wp);
    saveState();
    updateWaypointsUI();
    requestRender();
    showToast(`📌 Added waypoint "${name}"`);
  }

  function removeWaypoint(id) {
    state.waypoints = state.waypoints.filter(w => w.id !== id);
    saveState();
    updateWaypointsUI();
    requestRender();
    showToast(`🗑️ Removed waypoint`);
  }

  function updateWaypointsUI() {
    const list = document.getElementById('waypointList');
    if (!list) return;

    if (state.waypoints.length === 0) {
      list.innerHTML = `<div style="font-size: 11px; color: var(--text-dim); text-align: center; padding: 10px;">Right-click the map to add custom pins.</div>`;
      return;
    }

    list.innerHTML = '';
    state.waypoints.forEach(wp => {
      const item = document.createElement('div');
      item.style.cssText = `display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px; font-size: 12px;`;
      item.innerHTML = `
        <div style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <span style="color: ${wp.color}">📌</span>
          <strong>${wp.name}</strong>
          <span style="font-family: monospace; color: var(--text-muted);">[${wp.x}, ${wp.z}]</span>
        </div>
        <button class="btn btn-card" data-id="${wp.id}" style="padding: 2px 6px; color: #ef4444;">✕</button>
      `;

      item.querySelector('div').onclick = () => flyTo(wp.x, wp.z, 4.0);
      item.querySelector('button').onclick = (e) => {
        e.stopPropagation();
        removeWaypoint(wp.id);
      };

      list.appendChild(item);
    });
  }

  // --- Radar & Nearest Structure Engine ---
  function updateRadarList() {
    const ref = state.activeReference === 'home' && state.homeBase ? state.homeBase : state.playerPosition;

    // Filter structures
    let filtered = structures.filter(st => {
      // Tier filter
      if (state.tierFilter !== 'all' && st.tier !== state.tierFilter) {
        return false;
      }
      // Search filter
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        const matchName = st.name.toLowerCase().includes(q);
        const matchId = st.id.toLowerCase().includes(q);
        const matchCoords = `${st.mc_x} ${st.mc_z}`.includes(q);
        if (!matchName && !matchId && !matchCoords) return false;
      }
      return true;
    });

    // Compute distance and bearing from active reference
    filtered.forEach(st => {
      if (ref) {
        st.currentDistance = calcDistance(ref.x, ref.z, st.mc_x, st.mc_z);
        st.currentBearing = calcBearing(ref.x, ref.z, st.mc_x, st.mc_z);
      } else {
        st.currentDistance = calcDistance(0, 0, st.mc_x, st.mc_z);
        st.currentBearing = calcBearing(0, 0, st.mc_x, st.mc_z);
      }
    });

    // Sort by distance ascending
    filtered.sort((a, b) => a.currentDistance - b.currentDistance);

    totalVisibleCountEl.textContent = filtered.length;
    renderStructureCards(filtered);
  }

  function renderStructureCards(items) {
    structureListEl.innerHTML = '';

    if (items.length === 0) {
      structureListEl.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 30px; font-size: 13px;">
          No structures match your search or filter.
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(st => {
      const card = document.createElement('div');
      const isSelected = state.selectedStructure && state.selectedStructure.id === st.id;
      const isLooted = state.lootedStructures.has(st.id);

      card.className = `structure-card tier-${st.tier} ${isSelected ? 'selected' : ''} ${isLooted ? 'looted' : ''}`;
      card.setAttribute('data-id', st.id);

      let tierBadge = '🟡 Hard';
      if (st.tier === 'medium') tierBadge = '🟣 Med';
      if (st.tier === 'easy') tierBadge = '🔵 Easy';

      card.innerHTML = `
        <div class="card-top">
          <div class="card-title">
            <span>${st.name}</span>
            <span style="font-size: 10px; opacity: 0.7;">(${st.id})</span>
          </div>
          <div class="card-distance">
            <span>⚡ ${st.currentDistance}m</span>
          </div>
        </div>
        <div class="card-bottom">
          <div class="card-coords">X: ${st.mc_x}, Z: ${st.mc_z}</div>
          <div class="card-bearing">${st.currentBearing.cardinal} ${st.currentBearing.arrow} (${st.currentBearing.deg}°)</div>
        </div>
        <div class="card-actions">
          <button class="btn-card btn-focus-st" title="Center camera on structure">🎯 View</button>
          <button class="btn-card btn-tp-st" title="Copy /tp command">⚡ /tp</button>
          <button class="btn-card btn-loot-st" title="Mark as Looted / Cleared">${isLooted ? '✅ Looted' : '⭕ Mark Looted'}</button>
        </div>
      `;

      // Card click
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          selectStructure(st);
        }
      });

      // Focus button
      card.querySelector('.btn-focus-st').addEventListener('click', (e) => {
        e.stopPropagation();
        selectStructure(st);
      });

      // Copy /tp
      card.querySelector('.btn-tp-st').addEventListener('click', (e) => {
        e.stopPropagation();
        const cmd = `/tp @s ${st.mc_x} ~ ${st.mc_z}`;
        navigator.clipboard.writeText(cmd);
        showToast(`⚡ Copied: <code>${cmd}</code>`);
      });

      // Looted toggle
      card.querySelector('.btn-loot-st').addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.lootedStructures.has(st.id)) {
          state.lootedStructures.delete(st.id);
          showToast(`Marked ${st.id} as unlooted`);
        } else {
          state.lootedStructures.add(st.id);
          showToast(`✅ Marked ${st.id} as looted`);
        }
        saveState();
        updateRadarList();
        requestRender();
      });

      fragment.appendChild(card);
    });

    structureListEl.appendChild(fragment);
  }

  function updateStructureListSelection() {
    const cards = structureListEl.querySelectorAll('.structure-card');
    cards.forEach(card => {
      if (state.selectedStructure && card.getAttribute('data-id') === state.selectedStructure.id) {
        card.classList.add('selected');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.classList.remove('selected');
      }
    });
  }

  // --- UI Event Listeners ---

  // Sidebar Tabs
  const tabButtons = document.querySelectorAll('.sidebar-tab');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Pick Mode Buttons
  btnPickHome.addEventListener('click', () => setPickMode(state.pickMode === 'home' ? null : 'home'));
  btnPickHomeSidebar.addEventListener('click', () => setPickMode(state.pickMode === 'home' ? null : 'home'));
  btnPickPlayer.addEventListener('click', () => setPickMode(state.pickMode === 'player' ? null : 'player'));
  btnPickPlayerSidebar.addEventListener('click', () => setPickMode(state.pickMode === 'player' ? null : 'player'));

  btnClearHome.addEventListener('click', clearHomeBase);

  // Jump to Home / Full Map
  btnZoomHome.addEventListener('click', () => {
    if (state.homeBase) {
      flyTo(state.homeBase.x, state.homeBase.z, 3.5);
    } else {
      showToast("📍 Please set your Home Base first!");
      setPickMode('home');
    }
  });

  btnResetView.addEventListener('click', fitMapToView);
  btnRecenter.addEventListener('click', () => flyTo(0, 0, 1.0));

  btnZoomIn.addEventListener('click', () => {
    state.zoom = Math.min(state.maxZoom, state.zoom * 1.4);
    requestRender();
  });

  btnZoomOut.addEventListener('click', () => {
    state.zoom = Math.max(state.minZoom, state.zoom / 1.4);
    requestRender();
  });

  // Manual Home Coords
  btnSaveHomeManual.addEventListener('click', () => {
    const x = parseInt(homeXInput.value);
    const z = parseInt(homeZInput.value);
    if (!isNaN(x) && !isNaN(z)) {
      setHomeBase(x, z);
      showToast(`🏰 Home Base set to X: ${x}, Z: ${z}`);
    } else {
      showToast("⚠️ Please enter valid numeric coordinates");
    }
  });

  // Manual Player Coords
  btnSavePlayerManual.addEventListener('click', () => {
    const x = parseInt(playerXInput.value);
    const z = parseInt(playerZInput.value);
    if (!isNaN(x) && !isNaN(z)) {
      setPlayerPosition(x, z);
      showToast(`🧭 Player Position set to X: ${x}, Z: ${z}`);
    } else {
      showToast("⚠️ Please enter valid coordinates");
    }
  });

  // F3 String /tp parser
  f3PasteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      parseAndApplyCoords(f3PasteInput.value);
    }
  });

  function parseAndApplyCoords(raw) {
    if (!raw) return;
    // Match patterns like "X: 127, Z: 123", "/tp 127 64 123", "127 123", "127, 123"
    const matchTp = raw.match(/\/tp\s+(?:@\w+\s+)?(-?\d+)\s+(?:~|-?\d+)\s+(-?\d+)/i);
    const matchLabels = raw.match(/X:\s*(-?\d+)[,\s]+(?:Y:\s*-?\d+[,\s]+)?Z:\s*(-?\d+)/i);
    const matchSimple = raw.match(/(-?\d+)[,\s]+(?:-?\d+[,\s]+)?(-?\d+)/);

    let parsedX = null;
    let parsedZ = null;

    if (matchTp) {
      parsedX = parseInt(matchTp[1]);
      parsedZ = parseInt(matchTp[2]);
    } else if (matchLabels) {
      parsedX = parseInt(matchLabels[1]);
      parsedZ = parseInt(matchLabels[2]);
    } else if (matchSimple) {
      parsedX = parseInt(matchSimple[1]);
      parsedZ = parseInt(matchSimple[2]);
    }

    if (parsedX !== null && parsedZ !== null) {
      setPlayerPosition(parsedX, parsedZ);
      f3PasteInput.value = '';
      showToast(`🧭 Updated player location to X: ${parsedX}, Z: ${parsedZ}`);
    } else {
      showToast("⚠️ Could not recognize coordinate format");
    }
  }

  // Reference Point Toggle
  refFromHomeBtn.addEventListener('click', () => {
    state.activeReference = 'home';
    refFromHomeBtn.classList.add('active');
    refFromPlayerBtn.classList.remove('active');
    updateRadarList();
    updateCursorTelemetry();
    requestRender();
  });

  refFromPlayerBtn.addEventListener('click', () => {
    state.activeReference = 'player';
    refFromPlayerBtn.classList.add('active');
    refFromHomeBtn.classList.remove('active');
    updateRadarList();
    updateCursorTelemetry();
    requestRender();
  });

  // Radar Tier Filter Pills
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.tierFilter = pill.getAttribute('data-tier');
      updateRadarList();
    });
  });

  // Search Input
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    updateRadarList();
  });

  // Layer Toggles
  function bindToggle(id, layerKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = state.layers[layerKey];
    el.addEventListener('change', () => {
      state.layers[layerKey] = el.checked;
      saveState();
      requestRender();
    });
  }

  bindToggle('layerToggleHard', 'hard');
  bindToggle('layerToggleMedium', 'medium');
  bindToggle('layerToggleEasy', 'easy');
  bindToggle('layerToggleGrid', 'grid');
  bindToggle('layerToggleRings', 'rings');
  bindToggle('layerToggleGuidance', 'guidance');
  bindToggle('layerToggleBadges', 'badges');
  bindToggle('layerTogglePixelated', 'pixelated');

  // Custom Waypoint Button
  document.getElementById('btnAddWaypoint').addEventListener('click', () => {
    const x = prompt("X coordinate:", state.cursorMc.x);
    if (x === null) return;
    const z = prompt("Z coordinate:", state.cursorMc.z);
    if (z === null) return;
    const name = prompt("Waypoint Name:", "My Point");
    if (name) {
      addWaypoint(name, x, z);
    }
  });

  // Export / Import Data
  document.getElementById('btnExportData').addEventListener('click', () => {
    const data = {
      homeBase: state.homeBase,
      playerPosition: state.playerPosition,
      lootedStructures: Array.from(state.lootedStructures),
      waypoints: state.waypoints
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hoplite_map_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 Exported map data");
  });

  const importFileInput = document.getElementById('importFileInput');
  document.getElementById('btnImportData').addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.homeBase) state.homeBase = data.homeBase;
        if (data.playerPosition) state.playerPosition = data.playerPosition;
        if (data.lootedStructures) state.lootedStructures = new Set(data.lootedStructures);
        if (data.waypoints) state.waypoints = data.waypoints;
        saveState();
        updateHomeBaseUI();
        updateWaypointsUI();
        updateRadarList();
        requestRender();
        showToast("📤 Map data successfully imported!");
      } catch (err) {
        showToast("⚠️ Invalid backup JSON file");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btnResetAll').addEventListener('click', () => {
    if (confirm("Reset all saved map data (Home Base, looted structures, and waypoints)?")) {
      localStorage.clear();
      state.homeBase = null;
      state.playerPosition = { x: 127, z: 123 };
      state.lootedStructures.clear();
      state.waypoints = [];
      updateHomeBaseUI();
      updateWaypointsUI();
      updateRadarList();
      requestRender();
      showToast("⚠️ All map data reset");
    }
  });

  // --- Keyboard Shortcuts ---
  window.addEventListener('keydown', (e) => {
    // Esc to cancel picking or deselect
    if (e.key === 'Escape') {
      if (state.pickMode) {
        setPickMode(null);
      } else if (state.selectedStructure) {
        state.selectedStructure = null;
        updateStructureListSelection();
        requestRender();
      }
    }
    // H to Jump to Home
    if (e.key === 'h' || e.key === 'H') {
      if (document.activeElement.tagName !== 'INPUT' && state.homeBase) {
        flyTo(state.homeBase.x, state.homeBase.z, 3.5);
      }
    }
    // R to Reset view
    if (e.key === 'r' || e.key === 'R') {
      if (document.activeElement.tagName !== 'INPUT') {
        fitMapToView();
      }
    }
  });

  // --- Initialization ---
  function init() {
    loadSavedState();
    resizeCanvas();
    updateHomeBaseUI();
    updateWaypointsUI();
    updateRadarList();
    updateCursorTelemetry();
  }

  init();

})();
