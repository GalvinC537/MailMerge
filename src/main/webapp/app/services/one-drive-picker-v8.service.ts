import { Injectable } from '@angular/core';
import { PublicClientApplication, type Configuration, type AccountInfo } from '@azure/msal-browser';

type PickedItem = {
  id: string;
  name?: string;
  parentReference: { driveId: string };
  '@sharePoint.endpoint': string;
};

@Injectable({ providedIn: 'root' })
export class OneDrivePickerV8Service {
  // ✅ Put these in environment.ts in real code
  private readonly clientId = 'YOUR_ENTRA_APP_CLIENT_ID';
  private readonly authority = 'https://login.microsoftonline.com/common'; // or tenant-specific
  private readonly redirectUri = window.location.origin;

  // ✅ For OneDrive for Business, baseUrl is like: https://{tenant}-my.sharepoint.com
  private readonly baseUrl = 'https://YOUR_TENANT-my.sharepoint.com';

  private readonly msalApp = new PublicClientApplication({
    auth: {
      clientId: this.clientId,
      authority: this.authority,
      redirectUri: this.redirectUri,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
  } satisfies Configuration);

  // ✅ MSAL v3+ requires initialize() before any other MSAL API calls
  private readonly initPromise: Promise<void> = this.msalApp.initialize();

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  async pickExcelFile(): Promise<{ name: string; bytes: ArrayBuffer }> {
    const channelId = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

    const options = {
      sdk: '8.0',
      entry: { oneDrive: {} },
      authentication: {},
      messaging: {
        origin: window.location.origin,
        channelId,
      },
    };

    // Recommended popup sizing from docs
    const win = window.open('', 'Picker', 'width=1080,height=680');
    if (!win) throw new Error('Popup blocked. Please allow popups for this site.');

    // 1) POST picker config to {baseUrl}/_layouts/15/FilePicker.aspx
    await this.postToPicker(win, options);

    // 2) Establish MessageChannel when picker sends "initialize"
    const port = await this.waitForInitialize(win, channelId);

    // 3) Handle commands (authenticate / pick / close)
    const pickedItem = await this.runCommandLoop(win, port);

    // ✅ Enforce .xlsx at your app level
    const name = pickedItem.name ?? 'onedrive.xlsx';
    if (!name.toLowerCase().endsWith('.xlsx')) {
      win.close();
      throw new Error('Please choose an .xlsx spreadsheet.');
    }

    // 4) Download bytes
    const bytes = await this.downloadPickedFile(pickedItem);

    win.close();
    return { name, bytes };
  }

  private async postToPicker(win: Window, options: any): Promise<void> {
    const queryString = new URLSearchParams({
      filePicker: JSON.stringify(options),
      locale: 'en-us',
    });

    const url = `${this.baseUrl}/_layouts/15/FilePicker.aspx?${queryString.toString()}`;

    // Token for initial POST
    const accessToken = await this.getSharePointToken(this.baseUrl);

    const form = win.document.createElement('form');
    form.setAttribute('action', url);
    form.setAttribute('method', 'POST');

    const tokenInput = win.document.createElement('input');
    tokenInput.setAttribute('type', 'hidden');
    tokenInput.setAttribute('name', 'access_token');
    tokenInput.setAttribute('value', accessToken);
    form.appendChild(tokenInput);

    win.document.body.append(form);
    form.submit();
  }

  private waitForInitialize(win: Window, channelId: string): Promise<MessagePort> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const onMessage = (event: MessageEvent) => {
        if (event.source !== win) return;

        const msg = event.data;
        if (msg?.type === 'initialize' && msg?.channelId === channelId) {
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
        reject(new Error('Timed out waiting for OneDrive picker to initialize.'));
      }, 60_000);
    });
  }

  private runCommandLoop(win: Window, port: MessagePort): Promise<PickedItem> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      port.addEventListener('message', async (message: MessageEvent) => {
        const payload = message.data;

        if (payload?.type === 'notification') {
          // page-loaded etc (informational)
          return;
        }

        if (payload?.type !== 'command') return;

        // must acknowledge every command
        port.postMessage({ type: 'acknowledge', id: payload.id });

        const command = payload.data;

        try {
          if (command?.command === 'authenticate') {
            // picker requests tokens repeatedly
            const token = await this.getSharePointToken(command.resource);
            port.postMessage({
              type: 'result',
              id: payload.id,
              data: { result: 'token', token },
            });
            return;
          }

          if (command?.command === 'pick') {
            const items: PickedItem[] = command?.items ?? command?.value ?? command?.data?.items ?? command?.data?.value ?? [];

            if (!Array.isArray(items) || items.length === 0) {
              throw new Error('No file was selected.');
            }

            // tell picker we handled pick
            port.postMessage({
              type: 'result',
              id: payload.id,
              data: { result: 'success' },
            });

            resolve(items[0]);
            return;
          }

          if (command?.command === 'close') {
            win.close();
            reject(new Error('Picker closed.'));
            return;
          }

          // unsupported command
          port.postMessage({
            type: 'result',
            id: payload.id,
            data: { result: 'error', error: { code: 'unsupportedCommand', message: command?.command } },
          });
        } catch (err: any) {
          port.postMessage({
            type: 'result',
            id: payload.id,
            data: { result: 'error', error: { code: 'hostError', message: err?.message ?? String(err) } },
          });
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(err);
        }
      });

      port.start();
      port.postMessage({ type: 'activate' });
    });
  }

  private async downloadPickedFile(item: PickedItem): Promise<ArrayBuffer> {
    const driveId = item.parentReference.driveId;
    const itemId = item.id;

    // Download via Graph
    const graphToken = await this.getGraphToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to download file (${res.status}). ${text}`);
    }

    return await res.arrayBuffer();
  }

  private async getGraphToken(): Promise<string> {
    const scopes = ['User.Read', 'Files.Read.All', 'Sites.Read.All'];
    return this.acquireToken(scopes);
  }

  private async getSharePointToken(resource: string): Promise<string> {
    const normalized = resource.replace(/\/$/, '');
    // Picker v8 uses SharePoint tokens; request "{resource}/.default"
    return this.acquireToken([`${normalized}/.default`]);
  }

  private async acquireToken(scopes: string[]): Promise<string> {
    await this.ensureInitialized(); // ✅ critical line

    const accounts = this.msalApp.getAllAccounts();
    const account: AccountInfo | undefined = accounts[0];

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (account) {
        const resp = await this.msalApp.acquireTokenSilent({ scopes, account });
        return resp.accessToken;
      }
    } catch {
      // fall back to popup
    }

    const loginResp = await this.msalApp.loginPopup({ scopes });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!loginResp.account) {
      throw new Error('MSAL loginPopup did not return an account.');
    }

    this.msalApp.setActiveAccount(loginResp.account);

    const tokenResp = await this.msalApp.acquireTokenSilent({
      scopes,
      account: loginResp.account,
    });

    return tokenResp.accessToken;
  }
}
