export const ASSET_HUB_BROWSER_STYLES = `
            .hud-fb-window {
                position: fixed; width: 50vw; height: 70vh;
                right: 180px; top: 80px;
                background: rgba(10, 15, 25, 0.965); backdrop-filter: blur(16px);
                border: 1px solid rgba(0, 255, 204, 0.4); border-radius: 16px;
                box-shadow: 0 50px 120px rgba(0,0,0,0.9), 0 0 20px rgba(0, 255, 204, 0.1);
                display: none; flex-direction: column; overflow: hidden;
                z-index: 10000; color: white; font-family: 'Inter', sans-serif; outline: none;
            }
            .hud-fb-window:focus-within { border-color: #00ffcc; box-shadow: 0 50px 120px rgba(0,0,0,0.9), 0 0 30px rgba(0, 255, 204, 0.2); }
            .hud-fb-header {
                min-height: 50px; padding: 0 20px; background: rgba(255,255,255,0.03);
                border-bottom: 1px solid rgba(255,255,255,0.05);
                display: flex; justify-content: space-between; align-items: center; cursor: move;
            }
            .hud-fb-title { font-weight: 900; letter-spacing: 3px; color: #00ffcc; font-size: 13px; text-transform: uppercase; }
            .hud-fb-close { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 6px; font-size: 18px; transition: 0.2s; }
            .hud-fb-close:hover { background: #ff4d6d; }
            .hud-fb-signature { width: 100%; height: 2px; background: linear-gradient(90deg, #00ffcc, #0088ff, #ff00ff, #00ffcc); background-size: 300% 100%; animation: hudFlow 4s linear infinite; }
            @keyframes hudFlow { 0% { background-position: 0% 0%; } 100% { background-position: 300% 0%; } }
            .hud-fb-toolbar-area { display: flex; flex-direction: column; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05); }
            .hud-fb-toolbar-row { padding: 8px 15px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
            .hud-fb-toolbar-row.secondary { background: rgba(0,0,0,0.15); padding: 6px 15px; border-top: 1px solid rgba(255,255,255,0.02); row-gap: 8px; }
            .hud-fb-nav-group { display: flex; gap: 4px; background: rgba(255,255,255,0.03); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
            .hud-fb-path-group { display: flex; align-items: center; gap: 8px; flex: 1 1 420px; min-width: 260px; }
            .hud-fb-nav-btns { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
            .hud-fb-toolbar-row.secondary .hud-fb-nav-btns:first-child { flex: 1 1 520px; }
            .hud-fb-toolbar-row.secondary .hud-fb-nav-btns:last-child { flex: 0 0 auto; }
            .hud-fb-btn {
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
                color: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer;
                font-size: 11px; font-weight: 800; transition: all 0.2s; white-space: nowrap;
            }
            .hud-fb-btn:hover { background: rgba(0, 255, 204, 0.2); border-color: #00ffcc; transform: translateY(-1px); }
            select.hud-fb-btn:hover { transform: none; }
            .hud-fb-btn.primary { background: rgba(0, 255, 204, 0.1); border-color: rgba(0, 255, 204, 0.4); color: #00ffcc; }
            select.hud-fb-btn {
                background: #0a0f19; color: #00ffcc; padding-right: 24px; cursor: pointer;
                border-color: rgba(0, 255, 204, 0.4); outline: none;
                appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%2300ffcc' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
                background-repeat: no-repeat; background-position: right 10px center;
            }
            select.hud-fb-btn option { background: #0a0f19; color: #fff; padding: 10px; }
            select.hud-fb-btn:focus { border-color: #00ffcc; box-shadow: 0 0 15px rgba(0, 255, 204, 0.3); }
            .hud-fb-address-bar { flex: 1 1 280px; min-width: 180px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 6px 16px; overflow: hidden; display: flex; align-items: center; }
            .hud-fb-breadcrumb { display: flex; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 600; white-space: nowrap; min-width: max-content; }
            .hud-fb-path-part { cursor: pointer; color: rgba(255,255,255,0.8); }
            .hud-fb-path-part:hover { color: #00ffcc; text-decoration: underline; }
            .hud-fb-address-scroll { width: 30px; min-width: 30px; padding: 0; }
            .hud-fb-search-wrap { width: 250px; max-width: 100%; flex: 1 1 220px; position: relative; display: flex; align-items: center; }
            .hud-fb-search-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 6px 30px 6px 32px; color: #fff; font-size: 11px; outline: none; }
            .hud-fb-search-input:focus { border-color: #00ffcc; background: rgba(255,255,255,0.1); }
            .hud-fb-search-icon { position: absolute; left: 10px; opacity: 0.5; font-size: 12px; pointer-events: none; }
            .hud-fb-search-clear { position: absolute; right: 10px; opacity: 0.3; cursor: pointer; font-size: 14px; transition: 0.2s; }
            .hud-fb-search-clear:hover { opacity: 1; color: #ff4d6d; }
            .hud-fb-mode-hint {
                display: none;
                padding: 8px 12px;
                font-size: 11px;
                font-weight: 700;
                color: rgba(230, 255, 248, 0.92);
                background: linear-gradient(135deg, rgba(0,255,204,0.08), rgba(0,160,255,0.05));
                border-top: 1px solid rgba(255,255,255,0.04);
                border-bottom: 1px solid rgba(255,255,255,0.04);
                letter-spacing: 0.2px;
            }
            .hud-fb-statusbar {
                min-height: 28px;
                padding: 4px 12px;
                border-top: 1px solid rgba(255,255,255,0.04);
                border-bottom: 1px solid rgba(255,255,255,0.04);
                background: rgba(255,255,255,0.02);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .hud-fb-selected-full {
                flex: 1;
                min-width: 0;
                font-size: 11px;
                color: rgba(255,255,255,0.86);
                white-space: nowrap;
                overflow-x: auto;
                overflow-y: hidden;
                scrollbar-width: thin;
            }
            .hud-fb-status-right {
                font-size: 11px;
                color: rgba(255,255,255,0.55);
                white-space: nowrap;
            }
            @media (max-width: 980px) {
                .hud-fb-toolbar-row.secondary .hud-fb-nav-btns:last-child {
                    margin-left: 0 !important;
                    flex: 1 1 100%;
                }
            }
            .hud-fb-main { flex: 1; display: flex; overflow: hidden; }
            .hud-fb-sidebar { width: 200px; background: rgba(255,255,255,0.02); border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; padding: 15px 0; gap: 5px; overflow-y: auto; }
            .hud-fb-sidebar-section { padding: 10px 20px 5px; font-size: 10px; font-weight: 900; color: rgba(0, 255, 204, 0.5); text-transform: uppercase; letter-spacing: 1.5px; }
            .hud-fb-side-item { padding: 10px 20px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; gap: 12px; border-left: 4px solid transparent; transition: 0.2s; }
            .hud-fb-side-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
            .hud-fb-side-item.active { background: rgba(0, 255, 204, 0.1); color: #00ffcc; border-left-color: #00ffcc; }
            .hud-fb-side-item .delete-bookmark { margin-left: auto; opacity: 0; font-size: 12px; }
            .hud-fb-side-item:hover .delete-bookmark { opacity: 0.5; }
            .hud-fb-side-item .delete-bookmark:hover { opacity: 1; color: #ff4d6d; }
            .hud-fb-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .hud-fb-content { flex: 1; overflow-y: auto; padding: 20px; position: relative; scrollbar-width: thin; }
            .hud-fb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
            .hud-fb-loading-overlay {
                position: absolute; inset: 0; z-index: 1200; display: none;
                align-items: center; justify-content: center; gap: 10px; flex-direction: column;
                background: rgba(8, 12, 18, 0.88); backdrop-filter: blur(1px);
                color: #d9fff7; font-size: 12px; font-weight: 800; letter-spacing: 0.5px;
                pointer-events: all;
            }
            .hud-fb-loading-spinner {
                width: 24px; height: 24px; border-radius: 999px;
                border: 2px solid rgba(0,255,204,0.25);
                border-top-color: #00ffcc;
                animation: hudFbSpin 0.85s linear infinite;
                box-shadow: 0 0 14px rgba(0,255,204,0.2);
            }
            @keyframes hudFbSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .hud-fb-item {
                display: flex; flex-direction: column; background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.05); border-radius: 10px;
                overflow: hidden; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); aspect-ratio: 0.78; position: relative;
            }
            .hud-fb-item:hover { background: rgba(255,255,255,0.06); transform: translateY(-4px); border-color: rgba(255,255,255,0.2); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .hud-fb-item.selected { background: rgba(0, 255, 204, 0.12); border-color: rgba(0, 255, 204, 0.5); }
            .hud-fb-item.focused { border-color: #00ffcc; box-shadow: 0 0 20px rgba(0, 255, 204, 0.3); }
            .hud-fb-item.is-cut { opacity: 0.4; filter: grayscale(0.8); }
            .hud-fb-item-thumb-wrap { flex: 1; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
            .hud-fb-thumb { width: 100%; height: 100%; object-fit: contain; transition: 0.4s; }
            .hud-fb-item:hover .hud-fb-thumb { transform: scale(1.08); }
            .hud-fb-icon { font-size: 52px; filter: drop-shadow(0 0 15px rgba(0,0,0,0.5)); transition: 0.3s; }
            .hud-fb-item:hover .hud-fb-icon { transform: scale(1.15); filter: drop-shadow(0 0 20px rgba(0,255,204,0.3)); }
            .hud-fb-name { padding: 8px 8px; font-size: 10px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-top: 1px solid rgba(255,255,255,0.05); font-weight: 500; }
            .hud-fb-is-new { position: absolute; top: 10px; right: 10px; background: #00ffcc; color: #000; font-size: 9px; font-weight: 900; padding: 3px 8px; border-radius: 5px; box-shadow: 0 0 15px #00ffcc; z-index: 5; }
            .hud-fb-resizer { position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, rgba(0, 255, 204, 0.3) 50%); }
            .hud-fb-marquee { position: absolute; border: 1px solid #00ffcc; background: rgba(0, 255, 204, 0.1); pointer-events: none; z-index: 1000; display: none; }
            .hud-fb-drag-proxy { display: none; }
            .hud-fb-item-lock { position: absolute; top: 10px; right: 10px; opacity: 0; transition: 0.2s; z-index: 10; pointer-events: none; }
            .hud-fb-item:hover .hud-fb-item-lock { opacity: 1; }
            .hud-fb-pin-badge { background: #00ffcc; color: #000; font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 4px; box-shadow: 0 0 10px #00ffcc; cursor: pointer; pointer-events: auto; }
            .hud-fb-context-menu {
                position: fixed; background: #1a1f2e; border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 5px 0;
                z-index: 11000; min-width: 160px; font-size: 12px;
            }
            .hud-fb-cm-item { padding: 8px 15px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
            .hud-fb-cm-item:hover { background: rgba(0, 255, 204, 0.1); color: #00ffcc; }
            .hud-fb-cm-sep { height: 1px; background: rgba(255,255,255,0.05); margin: 5px 0; }
            @keyframes hudFadeScaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
`;
