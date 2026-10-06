// EXPERIMENTAL real Muse 2 connection over Bluetooth, using the open-source
// (unofficial) protocol in src/core/museProtocol.ts and react-native-ble-plx.
//
// - Does NOT work in Expo Go. It needs a "development build" (see README).
// - Not tested on a real headband yet. Expect to debug it with a real device.
// - For the real product, replace this with the official Muse SDK.

import { PermissionsAndroid, Platform } from 'react-native';
import {
  MUSE_CONTROL_UUID,
  MUSE_EEG_UUIDS,
  MUSE_SERVICE_UUID,
  PacketAssembler,
  START_SEQUENCE,
  base64ToBytes,
  bytesToBase64,
  encodeCommand,
} from '../core/museProtocol';
import { ConnectionState, DeviceSource, EegBatch } from '../core/types';

export class MuseBleSource implements DeviceSource {
  readonly kind = 'muse-ble' as const;
  readonly label = 'Real Muse 2 (experimental Bluetooth)';
  private manager: any = null;
  private device: any = null;
  private subs: { remove(): void }[] = [];
  private batchCbs = new Set<(b: EegBatch) => void>();
  private stateCbs = new Set<(s: ConnectionState, d?: string) => void>();
  private assembler = new PacketAssembler((b) => this.batchCbs.forEach((cb) => cb(b)));

  onBatch(cb: (b: EegBatch) => void) {
    this.batchCbs.add(cb);
    return () => this.batchCbs.delete(cb);
  }
  onState(cb: (s: ConnectionState, d?: string) => void) {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }
  private setState(s: ConnectionState, d?: string) {
    this.stateCbs.forEach((cb) => cb(s, d));
  }

  /** Loaded lazily so the app still runs in Expo Go (where this module is missing). */
  private getManager(): any {
    if (this.manager) return this.manager;
    let ble: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ble = require('react-native-ble-plx');
    } catch {
      throw new Error('Bluetooth module not available. Real Muse needs a development build, not Expo Go.');
    }
    this.manager = new ble.BleManager();
    return this.manager;
  }

  private async askPermissions(): Promise<void> {
    if (Platform.OS !== 'android') return; // iOS asks automatically (needs Info.plist text)
    const P = PermissionsAndroid.PERMISSIONS as any;
    const wanted = Number(Platform.Version) >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
    const res = await PermissionsAndroid.requestMultiple(wanted);
    if (Object.values(res).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new Error('Bluetooth permission was not granted');
    }
  }

  async connect(): Promise<void> {
    try {
      const manager = this.getManager();
      await this.askPermissions();
      this.setState('discovering', 'Looking for a Muse headband…');
      this.device = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          manager.stopDeviceScan();
          reject(new Error('No Muse found. Is it switched on and not connected to another app?'));
        }, 15000);
        manager.startDeviceScan(null, null, (err: any, dev: any) => {
          if (err) {
            clearTimeout(timeout);
            reject(err);
            return;
          }
          if (dev?.name && dev.name.startsWith('Muse')) {
            clearTimeout(timeout);
            manager.stopDeviceScan();
            resolve(dev);
          }
        });
      });

      this.setState('connecting', this.device.name);
      this.device = await this.device.connect();
      await this.device.discoverAllServicesAndCharacteristics();

      this.setState('configuring');
      this.assembler.reset();
      MUSE_EEG_UUIDS.forEach((uuid, channel) => {
        const sub = this.device.monitorCharacteristicForService(MUSE_SERVICE_UUID, uuid, (err: any, ch: any) => {
          if (err || !ch?.value) return;
          try {
            this.assembler.push(channel, base64ToBytes(ch.value));
          } catch {
            /* ignore malformed packet */
          }
        });
        this.subs.push(sub);
      });
      for (const cmd of START_SEQUENCE) await this.send(cmd);

      this.subs.push(
        this.device.onDisconnected(() => {
          this.setState('disconnected', 'Headband disconnected');
        }),
      );
      this.setState('streaming', this.device.name);
    } catch (e: any) {
      this.setState('error', e?.message ?? String(e));
      throw e;
    }
  }

  private async send(cmd: string): Promise<void> {
    await this.device.writeCharacteristicWithoutResponseForService(
      MUSE_SERVICE_UUID,
      MUSE_CONTROL_UUID,
      bytesToBase64(encodeCommand(cmd)),
    );
  }

  async disconnect(): Promise<void> {
    this.setState('stopping');
    try {
      if (this.device) await this.send('h');
    } catch {
      /* already gone */
    }
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    try {
      await this.device?.cancelConnection();
    } catch {
      /* ignore */
    }
    this.device = null;
    this.setState('disconnected');
  }
}
