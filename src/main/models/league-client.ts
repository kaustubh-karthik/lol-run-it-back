import fetch, {RequestInit} from 'node-fetch';
import https from "https";
import LCUConnector from "lcu-connector";
import {sleep} from "../utility/sleep";
import cp from "child_process";
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as path from 'path';

const agent = new https.Agent({
  rejectUnauthorized: false
});

const IS_MAC = process.platform === 'darwin';

type RequestMethod = 'GET' | 'POST'

export class Client extends EventEmitter {
  private url: string;
  private connectPromise;
  private _status: 'closed' | 'connecting' | 'opening' | 'connected' = 'closed';

  constructor() {
    super();

    this.connect();
  }

  async connect() {
    console.log('Client.connect called, current status:', this.status);
    
    // If already connecting or connected, return the existing promise
    if (this.status === 'connecting' || this.status === 'connected') {
      console.log('Already connecting or connected, returning existing promise');
      return this.connectPromise;
    }
    
    // If we're closed, try to open the client first
    if (this.status === 'closed') {
      try {
        console.log('Client closed, attempting to open it');
        await this.openClient();
      } catch (e) {
        console.error('Error opening client:', e);
        alert("Could not automatically open your client, please open the LoL Client manually");
      }
    }

    // Clear any existing promise to allow reconnection attempts
    this.connectPromise = null;
    console.log('Setting up new connection promise');

    return this.connectPromise = new Promise((res, rej) => {
      // Create a fresh connector
      const connector = new LCUConnector;
      console.log('Created new LCU connector');

      connector.on('connect', data => {
        console.log('LCU connector connected:', data);
        this.status = 'connected';
        res(data);
      });

      connector.on('disconnect', () => {
        console.log('LCU connector disconnected');
        this.status = 'closed';
        this.connectPromise = null; // Clear the promise on disconnect
      });

      console.log('Starting LCU connector');
      connector.start();
    });
  }

  async getUrl() {
    if (this.url) {
      return this.url;
    }

    const credentials = await this.connect();

    return this.url = `${credentials.protocol}://${credentials.username}:${credentials.password}@${credentials.address}:${credentials.port}`;
  }

  get status() {
    return this._status;
  }

  set status(status) {
    this._status = status;

    this.emit('status-changed', this.status);
  }

  openClient() {
    console.log('openClient called, setting status to opening');
    this.status = 'opening';

    return new Promise((res, rej) => {
      if (IS_MAC) {
        const macPath = '/Applications/League of Legends.app';
        console.log(`Checking for Mac client at: ${macPath}`);
        
        if (fs.existsSync(macPath)) {
          console.log('Mac client found, attempting to open');
          cp.exec(`open '${macPath}'`, (err) => {
            if (err) {
              console.error('Error opening Mac client:', err);
              this.status = 'closed';
              rej(`Error opening client from path: ${macPath}`);
            } else {
              console.log('Mac client launched successfully');
              this.status = 'connecting';
              res();
            }
          });
        } else {
          console.error('Mac client not found at expected path');
          this.status = 'closed';
          rej('League of Legends client not found on the system');
        }
      } else {
        // Windows paths
        const possiblePaths = [
          "C:\\Riot Games\\League of Legends\\LeagueClient.exe",
          "D:\\Riot Games\\League of Legends\\LeagueClient.exe",
          "C:\\Program Files\\Riot Games\\League of Legends\\LeagueClient.exe",
          "C:\\Program Files (x86)\\Riot Games\\League of Legends\\LeagueClient.exe"
        ];
        
        // Log all path checks
        console.log("Checking for League client at the following paths:");
        possiblePaths.forEach(p => {
          const exists = fs.existsSync(p);
          console.log(`- ${p}: ${exists ? 'FOUND' : 'NOT FOUND'}`);
        });
        
        // Check if client is already running
        this.isClientRunning().then(isRunning => {
          if (isRunning) {
            console.log('Client is already running, skipping launch');
            this.status = 'connecting';
            res();
            return;
          }
          
          // Find the first path that exists
          const existingPath = possiblePaths.find(clientPath => fs.existsSync(clientPath));
          
          if (existingPath) {
            console.log(`Found League client at: ${existingPath}, launching...`);
            cp.exec(`"${existingPath}"`, (err) => {
              if (err) {
                console.error(`Error launching from path ${existingPath}:`, err);
                this.status = 'closed';
                rej(`Error opening client from path: ${existingPath}`);
              } else {
                console.log('League client launch initiated');
                this.status = 'connecting';
                res();
              }
            });
          } else {
            console.error('League client not found in any default locations');
            this.status = 'closed';
            rej('League of Legends client not found in any of the default locations');
          }
        }).catch(err => {
          console.error('Error checking if client is running:', err);
          this.status = 'closed';
          rej(`Error checking client status: ${err.message}`);
        });
      }
    });
  }

  async isClientRunning() {
    return await LCUConnector.getLCUPathFromProcess() !== undefined;
  }

  async getRoflsFolder() {
    const path = await this.makeRequest('/lol-replays/v1/rofls/path')
      .then(res => res.text());

    // Strip quotes
    return path.replace(/"/g, '');
  }

  getReplayMetadata(gameId: number) {
    return this.makeRequest(`/lol-replays/v1/metadata/${gameId}`);
  }

  async downloadReplay(gameId: number) {
    await this.makeRequest(`/lol-replays/v1/rofls/${gameId}/download`, {}, 'POST');

    return this.waitForReplayDownload(gameId);
  }

  async watchReplay(gameId: number) {
    await this.downloadReplay(gameId);

    return this.makeRequest(`/lol-replays/v1/rofls/${gameId}/watch`, {}, 'POST');
  }

  private async waitForReplayDownload(gameId: number) {
    const validStates = ['checking', 'downloading'];
    const finishedState = 'watch';

    const recursive = async gameId => {
      await sleep(200);

      const metadata = await this.getReplayMetadata(gameId).then(res => res.json());
      if (metadata.state === finishedState) {
        // finished!
        return true;
      } else {
        if (validStates.indexOf(metadata.state) === -1) {
          throw new Error(`Could not download replay, state is ${metadata.state}`);
        }

        return recursive(gameId);
      }
    };

    return recursive(gameId);
  }

  private get jsonHeaders() {
    return {
      accept: 'application/json',
      ['Content-Type']: 'application/json'
    }
  }

  private async makeRequest(endpoint, body = {}, method: RequestMethod = 'GET', timeoutMs: number = 0) {
    const url = `${await this.getUrl()}${endpoint}`;

    let opts: RequestInit = {agent, method};
    if (method === 'POST') {
      opts.body = JSON.stringify(body);
      opts.headers = this.jsonHeaders;
    }

    const response = await fetch(url, opts);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Client response error: ${response.status} ${response.statusText} - ${await response.text()}`);
    }

    return response;
  }
}
