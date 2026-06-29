#!/bin/bash
set -e

# Source Rust environment
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Check if cargo is available
if ! command -v cargo &> /dev/null; then
    echo "Error: Rust/Cargo is not installed or not in PATH."
    echo "Please make sure Rust is installed and active by running: source \$HOME/.cargo/env"
    exit 1
fi

echo "Building the application in release mode using Tauri CLI..."
# This embeds the production frontend assets and compiles the backend
npm run tauri build -- --no-bundle

# Path to the compiled binary
BINARY_PATH="/home/jacktheripper/code/personal/markdown-reader/src-tauri/target/release/markdown-reader"
ICON_PATH="/home/jacktheripper/code/personal/markdown-reader/src-tauri/icons/128x128.png"
DESKTOP_DIR="$HOME/.local/share/applications"

# Check if binary exists
if [ ! -f "$BINARY_PATH" ]; then
    echo "Error: Compiled binary not found at $BINARY_PATH"
    exit 1
fi

STARTUP_WM_CLASS="markdown-reader"

echo "Creating desktop entry pointing to $BINARY_PATH..."
mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_DIR/zenmarkdown.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ZenMarkdown
Comment=Zen Markdown Reader & Editor
Exec=$BINARY_PATH
Icon=$ICON_PATH
Terminal=false
Categories=Utility;TextEditor;Development;
StartupWMClass=$STARTUP_WM_CLASS
EOF

chmod +x "$DESKTOP_DIR/zenmarkdown.desktop"

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$DESKTOP_DIR"
fi

echo "-------------------------------------------------------"
echo "Success! ZenMarkdown has been registered."
echo "You can now search for 'ZenMarkdown' in your system search bar."
echo "-------------------------------------------------------"
