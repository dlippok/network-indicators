import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const NetworkIndicators = GObject.registerClass(
class NetworkIndicators extends PanelMenu.Button {
    _init(extensionPath) {
        super._init(0.0, 'Network Indicators');

        this._iconsPath = GLib.build_filenamev([
            extensionPath,
            'icons',
            'hicolor',
            'scalable',
            'actions',
        ]);
        this._speedometerIcon = new St.Icon({
            gicon: this._getIcon('network-offline-symbolic.svg'),
            style_class: 'system-status-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._panelContent = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelContent.add_child(this._speedometerIcon);
        this.add_child(this._panelContent);

        this._latencyHistory = [];
        this._ipAddress = null;
        this._gatewayAddress = null;
        this._networkNameItem = new PopupMenu.PopupImageMenuItem(
            GLib.get_host_name(),
            null,
        );
        this._setMenuIcon(this._networkNameItem, 'network-name-symbolic.svg');
        this._networkNameItem.setSensitive(false);
        this._ipAddressItem = new PopupMenu.PopupImageMenuItem(
            '--',
            null,
        );
        this._setMenuIcon(this._ipAddressItem, 'ip-address-symbolic.svg');
        this._ipAddressItem.setSensitive(false);
        this._externalIpAddressItem = new PopupMenu.PopupImageMenuItem(
            '--',
            null,
        );
        this._externalIpAddressItem.setSensitive(false);
        this._setMenuIcon(this._externalIpAddressItem, 'external-ip-symbolic.svg');
        this._gatewayItem = new PopupMenu.PopupImageMenuItem(
            '--',
            null,
        );
        this._setMenuIcon(this._gatewayItem, 'gateway-symbolic.svg');
        this._gatewayItem.setSensitive(false);
        this._latencyItem = new PopupMenu.PopupImageMenuItem(
            '--',
            null,
        );
        this._setMenuIcon(this._latencyItem, 'latency-symbolic.svg');
        this._latencyItem.setSensitive(false);
        this._latencyGraphItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._latencyGraph = new St.BoxLayout({
            style_class: 'latency-graph',
            x_expand: true,
            y_align: Clutter.ActorAlign.END,
        });
        this._latencyGraphItem.add_child(this._latencyGraph);
        this._latencyGraphItem.setSensitive(false);
        this.menu.addMenuItem(this._networkNameItem);
        this.menu.addMenuItem(this._externalIpAddressItem);
        this.menu.addMenuItem(this._ipAddressItem);
        this.menu.addMenuItem(this._gatewayItem);
        this.menu.addMenuItem(this._latencyItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this._latencyGraphItem);
        
    }

    startNetworkRefresh() {
        this._refreshNetworkInfo();
        this._refreshTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            3,
            () => {
                this._refreshNetworkInfo();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    stopNetworkRefresh() {
        if (this._refreshTimeoutId) {
            GLib.Source.remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
    }

    async _refreshNetworkInfo() {
        const [ipResult, externalIpResult, gatewayResult, latencyResult] =
            await Promise.allSettled([
            this.getCurrentIpAddress(),
            this.getExternalIpAddress(),
            this.getGatewayAddress(),
            this.getLatency(),
            ]);

        if (ipResult.status === 'fulfilled') {
            this._ipAddress = ipResult.value;
            this._ipAddressItem.label.text = ipResult.value;
        } else {
            this._ipAddress = null;
            this._ipAddressItem.label.text = 'unavailable';
            this._ipAddressItem.setSensitive(false);
            logError(ipResult.reason, 'Failed to retrieve current IP address');
        }

        if (externalIpResult.status === 'fulfilled')
            this._externalIpAddressItem.label.text = externalIpResult.value;
        else {
            this._externalIpAddressItem.label.text = 'unavailable';
            logError(externalIpResult.reason, 'Failed to retrieve external IP address');
        }

        if (gatewayResult.status === 'fulfilled') {
            this._gatewayAddress = gatewayResult.value;
            this._gatewayItem.label.text = this._gatewayAddress;
        } else {
            this._gatewayAddress = null;
            this._gatewayItem.label.text = 'unavailable';
            this._gatewayItem.setSensitive(false);
            logError(gatewayResult.reason, 'Failed to retrieve default gateway');
        }

        if (latencyResult.status === 'fulfilled') {
            this._latencyItem.label.text = `${latencyResult.value} ms`;
            this._speedometerIcon.gicon = this._getSpeedometerIcon(latencyResult.value);
            this._latencyHistory.push({
                latency: Number.parseFloat(latencyResult.value),
                offline: false,
            });
            this._latencyHistory = this._latencyHistory.slice(-10);
            this._updateLatencyGraph();
        } else {
            this._latencyItem.label.text = 'unavailable';
            this._speedometerIcon.gicon = this._getIcon('network-offline-symbolic.svg');
            this._latencyHistory.push({offline: true});
            this._latencyHistory = this._latencyHistory.slice(-10);
            this._updateLatencyGraph();
            logError(latencyResult.reason, 'Failed to retrieve network latency');
        }
    }

    _updateLatencyGraph() {
        this._latencyGraph.destroy_all_children();

        if (this._latencyHistory.length === 0)
            return;

        const maxLatency = Math.max(
            ...this._latencyHistory
                .filter(measurement => !measurement.offline)
                .map(measurement => measurement.latency),
            1,
        );

        if (this._latencyHistory.length < 10)
            this._latencyGraph.add_child(new St.Widget({x_expand: true}));

        for (const measurementData of this._latencyHistory) {
            const measurement = new St.BoxLayout({
                vertical: true,
                style_class: 'latency-measurement',
                y_align: Clutter.ActorAlign.END,
            });
            const bar = new St.Widget({
                style_class: measurementData.offline
                    ? 'latency-bar latency-offline'
                    : `latency-bar ${this._getLatencyColor(measurementData.latency)}`,
            });
            bar.set_height(measurementData.offline
                ? 52
                : Math.max(4, Math.round((measurementData.latency / maxLatency) * 48)));
            measurement.add_child(bar);

            measurement.add_child(new St.Label({
                text: measurementData.offline ? '—' : `${Math.round(measurementData.latency)}`,
                style_class: 'latency-label',
                x_align: Clutter.ActorAlign.CENTER,
            }));
            this._latencyGraph.add_child(measurement);
        }
    }

    _getLatencyColor(latency) {
        const latencyMs = Number.parseFloat(latency);

        if (latencyMs < 100)
            return 'latency-good';
        if (latencyMs < 250)
            return 'latency-warning';
        return 'latency-bad';
    }

    _getIcon(filename) {
        return new Gio.FileIcon({
            file: Gio.File.new_for_path(GLib.build_filenamev([this._iconsPath, filename])),
        });
    }

    _setMenuIcon(item, filename) {
        item._icon.gicon = this._getIcon(filename);
    }

    _getSpeedometerIcon(latency) {
        const latencyMs = Number.parseFloat(latency);

        if (latencyMs < 30)
            return this._getIcon('network-excellent-symbolic.svg');
        if (latencyMs < 80)
            return this._getIcon('network-good-symbolic.svg');
        if (latencyMs < 100)
            return this._getIcon('network-ok-symbolic.svg');
        if (latencyMs < 250)
            return this._getIcon('network-weak-symbolic.svg');
        return this._getIcon('network-offline-symbolic.svg');
    }

    getLatency() {
        const subprocess = Gio.Subprocess.new(
            ['env', 'LC_ALL=C', 'ping', '-n', '-c', '1', '-W', '2', '8.8.8.8'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );

        return new Promise((resolve, reject) => {
            subprocess.communicate_utf8_async(null, null, (process, result) => {
                try {
                    const [success, stdout, stderr] =
                        process.communicate_utf8_finish(result);
                    const match = stdout.match(/time[=<]([\d.]+)\s*ms/);

                    if (success && match)
                        resolve(match[1]);
                    else
                        reject(new Error(stderr.trim() || 'No latency measurement found'));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    getCurrentIpAddress() {
        const subprocess = Gio.Subprocess.new(
            ['ip', '-o', 'addr', 'show', 'scope', 'global'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );

        return new Promise((resolve, reject) => {
            subprocess.communicate_utf8_async(null, null, (process, result) => {
                try {
                    const [, stdout, stderr] = process.communicate_utf8_finish(result);
                    const match = stdout.match(/\binet6?\s+([^\s/]+)/);

                    if (match)
                        resolve(match[1]);
                    else
                        reject(new Error(stderr.trim() || 'No active IP address found'));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    getExternalIpAddress() {
        const subprocess = Gio.Subprocess.new(
            ['curl', '--fail', '--silent', '--show-error', '--max-time', '2',
                'https://api.ipify.org'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );

        return new Promise((resolve, reject) => {
            subprocess.communicate_utf8_async(null, null, (process, result) => {
                try {
                    const [success, stdout, stderr] =
                        process.communicate_utf8_finish(result);
                    const address = stdout.trim();

                    if (success && address)
                        resolve(address);
                    else
                        reject(new Error(stderr.trim() || 'No external IP address found'));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    getGatewayAddress() {
        const subprocess = Gio.Subprocess.new(
            ['ip', 'route', 'show', 'default'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        );

        return new Promise((resolve, reject) => {
            subprocess.communicate_utf8_async(null, null, (process, result) => {
                try {
                    const [, stdout, stderr] = process.communicate_utf8_finish(result);
                    const match = stdout.match(/^default\s+via\s+([^\s]+)/m);

                    if (match)
                        resolve(match[1]);
                    else
                        reject(new Error(stderr.trim() || 'No default gateway found'));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

});

export default class NetworkUsageExtension extends Extension {
    enable() {
        this._indicator = new NetworkIndicators(this.path);
        this._indicator.add_style_class_name('panel-button');
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator.startNetworkRefresh();
    }

    disable() {
        this._indicator?.stopNetworkRefresh();
        this._indicator?.destroy();
        this._indicator = null;
    }
}
