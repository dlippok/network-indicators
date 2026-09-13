UUID := network-indicators@dlippok.github.io
EXTENSION_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
FILES := metadata.json extension.js stylesheet.css

.PHONY: install enable disable reload preview

install:
	install -d "$(EXTENSION_DIR)/icons/hicolor/scalable/actions"
	install -m 644 $(FILES) "$(EXTENSION_DIR)/"
	install -m 644 icons/hicolor/scalable/actions/*.svg \
		"$(EXTENSION_DIR)/icons/hicolor/scalable/actions/"

enable: install
	gnome-extensions enable "$(UUID)"

disable:
	gnome-extensions disable "$(UUID)"

reload: disable enable

preview: install
	dbus-run-session gnome-shell --devkit --wayland
