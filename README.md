# ComfyUI-HUD

ComfyUI-HUD is a custom node pack focused on practical workflow UX.<br>
It combines loader-focused HUD nodes, text helpers, monitoring tools, and an integrated asset browser designed for day-to-day ComfyUI use.

Korean documentation: [README.ko.md](README.ko.md)

![ComfyUI-HUD screenshot](screenshot.png)

For a more focused ComfyUI workspace, also check out [wenovaX/ComfyUI-Nexus](https://github.com/wenovaX/ComfyUI-Nexus).

## Highlights

- `Sample workflows`
  - On first startup, bundled examples are copied to `user/<profile>/workflows/hud_sample` without overwriting existing files
- `Asset Hub`
  - Floating asset manager for `input`, `output`, checkpoint preview folders, and registered local folders
  - Grid browser, bookmarks, rename/delete, drag and drop upload, keyboard navigation, and built-in media viewer
- `Load Checkpoint (Preview)`
  - Inline preview states, gallery view, VAE selection, filter tabs, bookmark filtering, and checkpoint preview folder editing
- `Stylish Naming`
  - Text/path helper node with presets, server-side state persistence, and next-number helper flow
- `Batch Images (Mask Editor)`
  - Multi-image batching with integrated mask editing
- `Prompt / conditioning helpers`
  - `String Combiner`, `String Encode Combiner`, `Prompt Pair Encode`, `Prompt Pair Relay`
- `Monitoring / loaders`
  - `GPU Monitor`, `Log Monitor`, `IPAdapter FaceID Loader`, `OpenPose ControlNet Master`

## Node List

### Loaders

#### `Load Checkpoint (Preview)`

- Checkpoint loader with inline preview and gallery support
- Includes VAE selection in the same flow
- Supports `All`, `SD15`, `SDXL` filtering and bookmark-only filtering
- Preview gallery is driven by the checkpoint-name folder under `models/checkpoints`

#### `VAE Resolver`

- Switch between checkpoint-embedded VAE and external VAE files
- Pass-through `clip` support for cleaner graph wiring

### Text / Conditioning

#### `String Combiner`

- Section-based text builder for reusable prompt blocks

#### `String Encode Combiner`

- Merges text and encodes CLIP conditioning in one node

#### `Prompt Pair Encode`

- Dual-panel positive/negative prompt encoder

#### `Prompt Pair Relay`

- Relays `positive`, `negative`, and packed `pair` data

#### `Stylish Naming`

- Utility node for formatted text/path output
- Presets and state are stored server-side

### Image

#### `Batch Images (Mask Editor)`

- Dynamic image slots
- Built-in mask editor
- Batched `IMAGE` and `MASK` outputs

### Utility / Monitoring

#### `GPU Monitor`

- Lightweight GPU stats node for HUD monitoring flows

#### `Log Monitor`

- HUD log visibility helper

#### `IPAdapter FaceID Loader`

- Helper loader for IPAdapter + CLIP Vision + InsightFace workflows

#### `OpenPose ControlNet Master`

- ControlNet helper node for prompt-pair-based workflows

## Asset Hub

The Asset Hub is available globally inside ComfyUI.

- Toggle shortcut: `Ctrl + Shift + B`
- Supported workflows:
  - Browse `input` and `output`
  - Open local folders through bookmarks
  - Manage checkpoint preview folders
  - Preview images and videos in the shared media viewer
- Supported operations:
  - Copy, cut, paste
  - Rename and delete
  - Create folders
  - Upload with drag and drop or OS file picker

## Architecture Notes

Recent cleanup focused on keeping behavior unchanged while making the codebase easier to maintain.

- Checkpoint preview frontend is split into smaller modules:
  - `preview.js`
  - `preview_ui_factory.js`
  - `preview_gallery_utils.js`
  - `preview_data_controller.js`
  - `preview_checkpoint_filter_controller.js`
- Stylish Naming now uses unified `stylish_naming` naming internally, while keeping compatibility with older `stylish_label` state files and routes
- File manager backend responsibilities are split into:
  - `file_manager_nodes.py`
  - `file_manager_bookmarks.py`
  - `file_manager_paths.py`
  - `file_manager_ops.py`

## Categories

- `HUD/Loaders`
- `HUD/Text`
- `HUD/Conditioning`
- `HUD/Image`
- `HUD/Monitoring`
- `HUD/IPAdapter`
- `HUD/ControlNet`

## Stability Notes

- Nodes are implemented as independent custom nodes and do not patch ComfyUI core nodes
- Most UI-heavy nodes keep state in workflow properties or server-side HUD data files
- If UI looks stale after an update, use `Ctrl+F5` and restart ComfyUI
- Console logging uses the `[ComfyUI_HUD]` prefix for consistency
