# Network Indicators

A GNOME Shell extension that displays the host name, local and external IP
addresses, default gateway, and network latency history in the top panel.

## Install locally

Install the extension with Make:

```sh
make install
```

Then enable it with:

```sh
make enable
```

On GNOME Shell 45 and newer, including GNOME Shell 50.4, log out and back in
if the extension does not appear immediately in Extensions.

## Development

After changing files, reload the extension:

```sh
make reload
```

## GNOME Shell preview

Run GNOME Shell in a nested Wayland session:

```sh
make preview
```

On current GNOME Shell versions, `--devkit` starts the nested compositor;
older versions may require a separate nested-session option. Close the preview
window or press `Ctrl+C` in the terminal to stop it.
