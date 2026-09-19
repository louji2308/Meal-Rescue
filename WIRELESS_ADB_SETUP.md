# Wireless ADB Setup (Phone as Hotspot)

## Problem

Android 11+ "Wireless debugging" toggle in Developer Options requires the phone to be connected to a WiFi network. **It does not work when the phone IS the hotspot.** This is a known Android limitation.

## Solution: Classic `tcpip` Method

The older `adb tcpip` method still works even when the phone is the hotspot. It only needs USB for a one-time setup (~2 minutes).

## Prerequisites

- Phone with USB debugging enabled (Developer Options)
- USB cable (only for initial setup)
- PC connected to the phone's hotspot
- ADB installed on PC (`adb devices` works)

## Setup Steps

### Step 1: Connect USB and enable TCP mode

```bash
# Verify phone is connected
adb devices -l

# Switch ADB to TCP/IP mode on port 5555
adb tcpip 5555
# Output: restarting in TCP mode port: 5555
```

### Step 2: Unplug USB

Once you see "restarting in TCP mode port: 5555", you can unplug the USB cable. It is no longer needed.

### Step 3: Connect wirelessly

Find your phone's hotspot IP. Since the phone IS the hotspot, its IP is typically `10.70.62.89` or similar. The PC's IP on the same network will be something like `10.70.62.237`.

```bash
# Connect to the phone over the hotspot network
adb connect <phone_ip>:5555

# Example:
adb connect 10.70.62.89:5555
# Output: connected to 10.70.62.89:5555

# Verify
adb devices -l
# Output: 10.70.62.89:5555  device  Infinix_X6857B
```

### Step 4: Done

Everything works wirelessly now:
- `adb shell` — remote shell
- `adb install` — install APKs
- `adb push/pull` — file transfer
- `adb shell screencap` — screenshots
- `adb shell am start` — launch apps
- Metro bundler, backend, Postgres — all unaffected (run on PC)

## How It Works

| Service | Runs on | Phone accesses via |
|---|---|---|
| Metro bundler | PC (localhost:8081) | `pc_ip:8081` over hotspot |
| Backend API | PC (localhost:3010) | `pc_ip:3010` over hotspot |
| Postgres | PC (localhost:5432) | backend connects locally |
| ADB | PC ↔ phone | `phone_ip:5555` over hotspot |

The phone connects to your PC's dev server over the hotspot network, same as it would over WiFi.

## Limitations

- **Reboot resets it**: If the phone reboots, `tcpip` mode resets. Plug USB in briefly and re-run `adb tcpip 5555`.
- **Connection drops**: If the hotspot restarts or the phone loses power, you need to reconnect with `adb connect`.
- **No "Wireless debugging" toggle**: The native Android wireless debugging feature (with pairing codes/QR) will still be greyed out. That's fine — the `tcpip` method bypasses it entirely.

## Troubleshooting

### "cannot connect... actively refused (10061)"
- `adb tcpip 5555` was not run, or phone rebooted since. Reconnect USB and re-run it.

### "unauthorized"
- Check your phone for "Allow USB debugging?" popup. Tap Allow.

### Phone not showing in `adb devices`
- Try a different USB cable (data cable, not charge-only)
- Enable USB debugging in Developer Options
- Revoke USB debugging authorizations and re-authorize

### Two devices showing in `adb devices`
- Disconnect the stale one: `adb disconnect <old_serial>`

## Quick Reference

```bash
# Setup (one-time, needs USB)
adb tcpip 5555

# Connect (no USB needed)
adb connect <phone_ip>:5555

# Check connection
adb devices -l

# Screenshot
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png .

# Launch app
adb shell monkey -p com.mealrescue.app -c android.intent.category.LAUNCHER 1

# Disconnect
adb disconnect <phone_ip>:5555
```
