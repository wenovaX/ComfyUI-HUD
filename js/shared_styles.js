import { app } from "/scripts/app.js";

const SHARED_STYLE_ID = "hud-custom-utility-shared-style";

if (!document.getElementById(SHARED_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SHARED_STYLE_ID;
    style.textContent = `
    @keyframes hudRainbowFlow {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
    }
    
    @keyframes hudGoldFlow {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
    }
    
    @keyframes hudPulseGlow {
        0% { box-shadow: 0 0 0 rgba(255,255,255,0.00); }
        50% { box-shadow: 0 0 18px rgba(255,255,255,0.10); }
        100% { box-shadow: 0 0 0 rgba(255,255,255,0.00); }
    }
    
    @keyframes hudPreviewSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    @keyframes hudGlowPulse {
        0% { box-shadow: 0 0 0 rgba(255,220,140,0.0); }
        50% { box-shadow: 0 0 24px rgba(255,220,140,0.35); }
        100% { box-shadow: 0 0 0 rgba(255,220,140,0.0); }
    }
    `;
    document.head.appendChild(style);
}

export const css = (el, styles) => {
    Object.assign(el.style, styles);
    return el;
};

export function watchNodeColor(node, onColorChange) {
    let lastColorSignature = "";
    const interval = setInterval(() => {
        const nextSignature = `${node.bgcolor ?? ""}|${node.color ?? ""}`;
        if (nextSignature !== lastColorSignature) {
            lastColorSignature = nextSignature;
            onColorChange();
        }
    }, 250);
    return () => clearInterval(interval);
}

export function applyComfyUI_HUD_NodeStyle(target, options) {
    const apply = () => {
        let root = null;
        const isNodeObj = target && target.id != null && !target.tagName;
        
        // Strategy 0: Use cache if available
        if (isNodeObj && target._hud_root_cache && document.contains(target._hud_root_cache)) {
            root = target._hud_root_cache;
        } else if (isNodeObj) {
            // Strategy 1: Target is a LiteGraph node object, find by ID
            const nodeId = String(target.id);
            root = document.querySelector(`[data-node-id="${nodeId}"]`) ||
                   document.querySelector(`.comfy-node[data-node-id="${nodeId}"]`) ||
                   document.querySelector(`.graph-node[data-node-id="${nodeId}"]`);
            
            if (root) {
                root = root.querySelector('[data-testid="node-inner-wrapper"]') || root;
                target._hud_root_cache = root;
            }
        } else if (target && target.closest) {
            // Strategy 2: Target is a DOM element inside the node
            root = target.closest('[data-testid="node-inner-wrapper"]') || 
                   target.closest('.comfy-node') || 
                   target.closest('.litegraph.node') ||
                   target.closest('.graph-node');
        }

        if (!root) return false;

        // Ensure we are working with the inner wrapper if possible for better styling
        const inner = root.querySelector('[data-testid="node-inner-wrapper"]') || root;
        const header = inner.querySelector('[data-testid^="node-header-"]') || inner.querySelector('.node-header');
        const body = inner.querySelector('[data-testid^="node-body-"]') || inner.querySelector('.node-body');

        if (options.rootGradient) {
            inner.style.setProperty("background-image", options.rootGradient, "important");
            inner.style.setProperty("background-blend-mode", "screen", "important");
            inner.style.removeProperty("background-color");
        }
        if (options.rootBorder) {
            inner.style.setProperty("border", options.rootBorder, "important");
        }
        if (options.rootBoxShadow) {
            inner.style.setProperty("box-shadow", options.rootBoxShadow, "important");
        }

        if (header && options.headerGradient) {
            header.style.setProperty("background-image", options.headerGradient, "important");
            header.style.setProperty("background-blend-mode", "screen", "important");
            header.style.removeProperty("background-color");
        }

        if (body) {
            const bodyWash = options.bodyWash || "linear-gradient(135deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))";
            const bgImage = options.skipRootInBody 
                ? bodyWash 
                : `${bodyWash}${options.rootGradient ? `, ${options.rootGradient}` : ""}`;
            
            body.style.setProperty("background-image", bgImage, "important");
            body.style.setProperty("background-blend-mode", "screen", "important");
            body.style.removeProperty("background-color");
        }

        inner.onmouseenter = () => { inner.style.filter = "brightness(1.09)"; };
        inner.onmouseleave = () => { inner.style.filter = "brightness(1)"; };
        return true;
    };

    if (!apply()) {
        let attempts = 0;
        const timer = setInterval(() => {
            if (apply() || ++attempts > 20) clearInterval(timer);
        }, 150);
    }
}

export const DEBUG = false; // Set to true to enable developer logs

export const log = (message, nodeName) => {
    if (!DEBUG) return;
    const tag = nodeName ? "[" + nodeName + "]" : "";
    const prefix = "[ComfyUI_HUD]" + tag;
    console.log(
        "%c" + prefix + "%c " + message,
        "background: #ff9000; color: white; font-weight: bold; border-radius: 4px; padding: 2px 4px;",
        "color: #ff9000; font-weight: normal;"
    );
};
