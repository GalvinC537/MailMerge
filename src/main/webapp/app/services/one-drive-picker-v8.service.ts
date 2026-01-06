import { Injectable } from '@angular/core';
import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

type PickedItem = {
  id: string;
  name?: string;
  parentReference: { driveId: string };
};

@Injectable({ providedIn: 'root' })
export class OneDrivePickerV8Service {
  // ✅ Your Entra App Client ID
  private readonly clientId = '8adac603-1de0-425c-9634-710e35513144';

  // ✅ Personal Microsoft accounts
  private readonly authority = 'https://login.microsoftonline.com/consumers';

  // ✅ Must EXACTLY match Azure SPA redirect URI
  private readonly redirectUri = `${window.location.origin}/msal-redirect.html`;

  // ✅ OneDrive picker host
  private readonly baseUrl = 'https://onedrive.live.com/picker';

  private readonly msalApp = new PublicClientApplication({
    auth: {
      clientId: this.clientId,
      authority: this.authority,
      redirectUri: this.redirectUri,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
  } satisfies Configuration);

  // ✅ MSAL v3+ requires initialize()
  private readonly initPromise: Promise<void> = (async () => {
    await this.msalApp.initialize();
    await this.msalApp.handleRedirectPromise();
  })();

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private async warmUpAuth(): Promise<void> {
    await this.getGraphToken();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  async pickExcelFileInWindow(win: Window): Promise<{ name: string; bytes: ArrayBuffer }> {
    const channelId = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

    win.document.write('<p style="font-family:Segoe UI,Arial">Opening OneDrive…</p>');

    const options = {
      sdk: '8.0',
      entry: { oneDrive: {} },
      messaging: {
        origin: window.location.origin,
        channelId,
      },
    };

    // ✅ do auth AFTER popup exists (but still directly from the click)
    await this.warmUpAuth();

    // 1️⃣ Load picker into the already-open window
    await this.postToPicker(win, options);

    // 2️⃣ Wait for picker init
    const port = await this.waitForInitialize(win, channelId);

    // 3️⃣ Handle picker commands (includes filename fix)
    const pickedItem = await this.runCommandLoop(win, port);

    // 4️⃣ Ensure we have a real filename + validate extension
    const name = (pickedItem.name ?? 'onedrive.xlsx').trim();
    if (!name.toLowerCase().endsWith('.xlsx')) {
      win.close();
      throw new Error('Please choose an .xlsx spreadsheet.');
    }

    // 5️⃣ Download file bytes directly from Graph
    const bytes = await this.downloadPickedFile(pickedItem);

    win.close();
    return { name, bytes };
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  async pickExcelFile(): Promise<{ name: string; bytes: ArrayBuffer }> {
    const win = window.open('', 'Picker', 'width=1080,height=680');
    if (!win) throw new Error('Popup blocked. Please allow popups for this site.');
    return this.pickExcelFileInWindow(win);
  }

  private async postToPicker(win: Window, options: unknown): Promise<void> {
    const queryString = new URLSearchParams({
      filePicker: JSON.stringify(options),
      locale: 'en-us',
    });

    const url = `${this.baseUrl}?${queryString.toString()}`;
    const accessToken = await this.getGraphToken();

    const form = win.document.createElement('form');
    form.method = 'POST';
    form.action = url;

    const tokenInput = win.document.createElement('input');
    tokenInput.type = 'hidden';
    tokenInput.name = 'access_token';
    tokenInput.value = accessToken;

    form.appendChild(tokenInput);
    win.document.body.appendChild(form);
    form.submit();
  }

  private waitForInitialize(win: Window, channelId: string): Promise<MessagePort> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const onMessage = (event: MessageEvent) => {
        if (event.source !== win) return;

        if (event.data?.type === 'initialize' && event.data?.channelId === channelId) {
          window.removeEventListener('message', onMessage);
          const port = event.ports[0];
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!port) return reject(new Error('Picker did not provide a MessagePort.'));
          resolve(port);
        }
      };

      window.addEventListener('message', onMessage);

      setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Timed out waiting for OneDrive picker.'));
      }, 60000);
    });
  }

  private runCommandLoop(win: Window, port: MessagePort): Promise<PickedItem> {
    return new Promise((resolve, reject) => {
      port.onmessage = async message => {
        const payload = message.data;
        if (payload?.type !== 'command') return;

        port.postMessage({ type: 'acknowledge', id: payload.id });

        try {
          if (payload.data?.command === 'authenticate') {
            const token = await this.getGraphToken();
            port.postMessage({
              type: 'result',
              id: payload.id,
              data: { result: 'token', token },
            });
            return;
          }

          if (payload.data?.command === 'pick') {
            const items = payload.data.items ?? [];
            if (!items.length) throw new Error('No file selected.');

            const picked = items[0] as PickedItem;

            // ✅ Filename fix: picker sometimes omits it, so fetch it from Graph
            if (!picked.name) {
              const token = await this.getGraphToken();
              const driveId = picked.parentReference.driveId;
              const itemId = picked.id;

              if (driveId && itemId) {
                const fetchedName = await this.fetchItemName(driveId, itemId, token);
                if (fetchedName) picked.name = fetchedName;
              }
            }

            port.postMessage({
              type: 'result',
              id: payload.id,
              data: { result: 'success' },
            });

            resolve(picked);
            return;
          }

          if (payload.data?.command === 'close') {
            win.close();
            reject(new Error('Picker closed.'));
          }
        } catch (err) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(err);
        }
      };

      port.start();
      port.postMessage({ type: 'activate' });
    });
  }

  private async downloadPickedFile(item: PickedItem): Promise<ArrayBuffer> {
    const token = await this.getGraphToken();

    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${item.parentReference.driveId}/items/${item.id}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Graph download failed (${res.status}). ${text}`);
    }

    return res.arrayBuffer();
  }

  private async fetchItemName(driveId: string, itemId: string, token: string): Promise<string | null> {
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=name`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { name?: string };
    return json.name ?? null;
  }

  private async getGraphToken(): Promise<string> {
    return this.acquireToken(['Files.Read']);
  }

  private async acquireToken(scopes: string[]): Promise<string> {
    await this.ensureInitialized();

    const account = this.msalApp.getAllAccounts()[0];

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (account) {
        const resp = await this.msalApp.acquireTokenSilent({ scopes, account });
        return resp.accessToken;
      }
    } catch {
      // fallback to popup
    }

    const loginResp = await this.msalApp.loginPopup({
      scopes,
      redirectUri: this.redirectUri,
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!loginResp.account) throw new Error('Login failed.');

    this.msalApp.setActiveAccount(loginResp.account);

    const tokenResp = await this.msalApp.acquireTokenSilent({
      scopes,
      account: loginResp.account,
    });

    return tokenResp.accessToken;
  }
}
