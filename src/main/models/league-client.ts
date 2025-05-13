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
    
    // If already connected, return the existing promise
    if (this.status === 'connected') {
      console.log('Already connected, returning existing promise');
      return this.connectPromise;
    }
    
    // Reset status if we're trying to connect again
    if (this.status === 'connecting') {
      console.log('Previous connection attempt in progress, resetting');
      this.status = 'closed';
      this.connectPromise = null;
    }
    
    // Check if client is running first
    let isRunning = false;
    try {
      isRunning = await this.isClientRunning();
      console.log(`Is client already running check: ${isRunning}`);
    } catch (err) {
      console.error('Error checking if client is running:', err);
    }
    
    // Try to open the client if it's not running
    if (!isRunning) {
      try {
        console.log('Client not running, attempting to open it');
        this.status = 'opening';
        await this.openClient();
        
        // Give client some time to start up before trying to connect
        console.log('Waiting for client to initialize...');
        await sleep(10000); // Wait 10 seconds like in Python script
      } catch (e) {
        console.error('Error opening client:', e);
        alert("Could not automatically open your client, please open the LoL Client manually");
      }
    } else {
      console.log('Client is already running, will attempt to connect directly');
    }
    
    // Set status to connecting
    this.status = 'connecting';
    
    // Clear any existing promise to allow reconnection attempts
    this.connectPromise = null;
    
    // Return promise for connection
    return this.connectPromise = this.createConnectionPromise();
  }
  
  createConnectionPromise() {
    console.log('Creating new connection promise');
    
    // Try first to get credentials from lockfile
    return new Promise(async (resolve, reject) => {
      try {
        // First try the direct lockfile approach
        console.log('Trying lockfile approach first');
        const lockfileCredentials = await this.getLockfileCredentials();
        
        if (lockfileCredentials) {
          console.log('Successfully retrieved credentials from lockfile');
          this.url = `${lockfileCredentials.protocol}://${lockfileCredentials.username}:${lockfileCredentials.password}@${lockfileCredentials.address}:${lockfileCredentials.port}`;
          this.status = 'connected';
          resolve(lockfileCredentials);
          return;
        }
        
        console.log('Lockfile approach failed, trying LCUConnector');
      } catch (err) {
        console.error('Error with lockfile approach:', err);
        console.log('Continuing with LCUConnector approach');
      }
      
      // If lockfile approach failed, use LCUConnector as fallback
      let connector;
      try {
        connector = new LCUConnector();
        console.log('Created new LCU connector');
      } catch (err) {
        console.error('Error creating LCU connector:', err);
        this.status = 'closed';
        reject(new Error(`Failed to create LCU connector: ${err.message}`));
        return;
      }
      
      // Track connection attempts
      let attempts = 0;
      const maxAttempts = 5;
      let retryInterval;
      let connectTimeout;
      
      const cleanup = () => {
        if (retryInterval) clearInterval(retryInterval);
        if (connectTimeout) clearTimeout(connectTimeout);
      };
      
      // Event handlers
      connector.on('connect', data => {
        console.log('LCU connector connected successfully with data:', data);
        this.url = `${data.protocol}://${data.username}:${data.password}@${data.address}:${data.port}`;
        this.status = 'connected';
        cleanup();
        resolve(data);
      });
      
      connector.on('disconnect', () => {
        console.log('LCU connector disconnected');
        if (this.status === 'connected') {
          console.log('Setting status to closed after disconnect');
          this.status = 'closed';
          this.connectPromise = null;
        }
        cleanup();
      });
      
      // Overall timeout
      connectTimeout = setTimeout(() => {
        console.error('Connection timeout reached');
        cleanup();
        this.status = 'closed';
        reject(new Error('Connection timeout reached after 30 seconds'));
      }, 30000);
      
      // Start connector and retry mechanism
      console.log('Starting LCU connector');
      try {
        connector.start();
      } catch (err) {
        console.error('Error starting connector:', err);
      }
      
      retryInterval = setInterval(() => {
        attempts++;
        console.log(`Connection attempt ${attempts}/${maxAttempts}`);
        
        if (this.status === 'connected') {
          console.log('Already connected, clearing retry interval');
          cleanup();
          return;
        }
        
        if (attempts >= maxAttempts) {
          console.error('Max connection attempts reached');
          cleanup();
          this.status = 'closed';
          reject(new Error('Failed to connect to League client after multiple attempts'));
          return;
        }
        
        try {
          connector.start();
        } catch (err) {
          console.error(`Error on retry attempt ${attempts}:`, err);
        }
      }, 5000);
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
        this.checkLeagueProcesses().then(isRunning => {
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
            
            try {
              // Use spawn instead of exec for better process handling
              const process = cp.spawn(existingPath, [], {
                detached: true,
                stdio: 'ignore',
                windowsHide: false
              });
              
              process.on('error', (err) => {
                console.error(`Error launching from path ${existingPath}:`, err);
                this.status = 'closed';
                rej(`Error opening client from path: ${existingPath}`);
              });
              
              // Unref the process to let it run independently
              process.unref();
              console.log('League client launch initiated with spawn');
              this.status = 'connecting';
              res();
            } catch (err) {
              console.error('Error in spawn:', err);
              
              // Fall back to exec as a backup method
              console.log('Falling back to exec method...');
              cp.exec(`"${existingPath}"`, (err) => {
                if (err) {
                  console.error(`Error launching from path ${existingPath} with exec:`, err);
                  this.status = 'closed';
                  rej(`Error opening client from path: ${existingPath}`);
                } else {
                  console.log('League client launch initiated with exec fallback');
                  this.status = 'connecting';
                  res();
                }
              });
            }
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
    console.log('Checking if League client is running...');

    // Try multiple detection methods and return true if any succeed
    try {
      // Method 1: Using LCUConnector's built-in method
      console.log('Method 1: Using LCUConnector.getLCUPathFromProcess()');
      try {
        const lcuPath = await LCUConnector.getLCUPathFromProcess();
        if (lcuPath !== undefined) {
          console.log('✓ Client detected via LCUConnector with path:', lcuPath);
          return true;
        }
        console.log('✗ Client not detected via LCUConnector');
      } catch (err) {
        console.error('Error in LCUConnector detection:', err);
      }
      
      // Method 2: Check lockfile existence
      console.log('Method 2: Checking for lockfile existence');
      const lockfilePath = this.getLockfilePath();
      if (fs.existsSync(lockfilePath)) {
        console.log(`✓ Lockfile found at ${lockfilePath}`);
        return true;
      }
      console.log('✗ Lockfile not found');
      
      // Method 3: Check processes directly
      console.log('Method 3: Checking processes directly');
      const processResult = await this.checkLeagueProcesses();
      if (processResult) {
        console.log('✓ League process found via direct process check');
        return true;
      }
      console.log('✗ League process not found via direct process check');
      
      // If all methods fail, client is not running
      console.log('All detection methods failed, League client is not running');
      return false;
    } catch (error) {
      console.error('Error in isClientRunning:', error);
      return false;
    }
  }
  
  async checkLeagueProcesses() {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        // Windows: Check for League processes
        // Use wmic for more reliable process detection
        cp.exec('wmic process where "name like \'%League%\'" get processid,name', (err, stdout) => {
          if (err) {
            console.error('Error in wmic process check:', err);
            
            // Fallback to tasklist
            cp.exec('tasklist /FI "IMAGENAME eq LeagueClient.exe" /FI "IMAGENAME eq LeagueClientUx.exe" /FI "IMAGENAME eq RiotClientServices.exe"', (err2, stdout2) => {
              if (err2) {
                console.error('Error in tasklist fallback:', err2);
                resolve(false);
                return;
              }
              
              const output = stdout2.toLowerCase();
              const hasLeagueClient = output.includes('leagueclient.exe');
              const hasLeagueClientUx = output.includes('leagueclientux.exe');
              const hasRiotClient = output.includes('riotclientservices.exe');
              
              console.log(`Tasklist results - LeagueClient: ${hasLeagueClient}, LeagueClientUx: ${hasLeagueClientUx}, RiotClient: ${hasRiotClient}`);
              resolve(hasLeagueClient || hasLeagueClientUx || hasRiotClient);
            });
            return;
          }
          
          const output = stdout.toLowerCase();
          const hasLeagueProcess = output.includes('league') || output.includes('riot');
          console.log(`WMIC results - Has League process: ${hasLeagueProcess}`);
          
          if (hasLeagueProcess) {
            // List the detected processes for debugging
            const processes = stdout.split('\n')
              .filter(line => line.trim().length > 0)
              .map(line => line.trim())
              .slice(1); // Skip header
            
            console.log('Detected League-related processes:');
            processes.forEach(p => console.log(`- ${p}`));
          }
          
          resolve(hasLeagueProcess);
        });
      } else if (process.platform === 'darwin') {
        // macOS: Check for League processes
        cp.exec('ps -ax | grep -i "League\\|Riot" | grep -v grep', (err, stdout) => {
          if (err && err.code !== 1) {
            console.error('Error in macOS process check:', err);
            resolve(false);
            return;
          }
          
          const hasLeagueProcess = stdout.trim().length > 0;
          console.log(`macOS ps results - Has League process: ${hasLeagueProcess}`);
          
          if (hasLeagueProcess) {
            // List the detected processes for debugging
            console.log('Detected League-related processes:');
            stdout.split('\n')
              .filter(line => line.trim().length > 0)
              .forEach(p => console.log(`- ${p.trim()}`));
          }
          
          resolve(hasLeagueProcess);
        });
      } else {
        // Unsupported platform
        console.warn('Process checking not implemented for this platform');
        resolve(false);
      }
    });
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

  // Get credentials directly from the lockfile as a fallback method
  async getLockfileCredentials() {
    try {
      console.log('Attempting to get credentials from lockfile directly');
      
      // Determine the lockfile path based on the platform
      const lockfilePath = this.getLockfilePath();
      console.log(`Looking for lockfile at: ${lockfilePath}`);
      
      if (!fs.existsSync(lockfilePath)) {
        console.log('Lockfile not found');
        return null;
      }
      
      // Read the lockfile content
      const content = fs.readFileSync(lockfilePath, 'utf8');
      console.log(`Lockfile content found with length: ${content.length}`);
      
      // Parse the content (format: LeagueClient:port:pid:token:https)
      const parts = content.split(':');
      if (parts.length !== 5) {
        console.error(`Invalid lockfile format. Got ${parts.length} parts instead of 5`);
        return null;
      }
      
      console.log(`Lockfile parsed successfully. Port: ${parts[1]}, Protocol: ${parts[4]}`);
      
      // Return the credentials in the same format as LCUConnector
      return {
        protocol: parts[4],
        address: '127.0.0.1',
        port: parts[1],
        username: 'riot',
        password: parts[3]
      };
    } catch (error) {
      console.error('Error reading lockfile:', error);
      return null;
    }
  }
  
  getLockfilePath() {
    if (process.platform === 'win32') {
      // Windows: lockfile is typically in C:\Riot Games\League of Legends\lockfile
      // Try to find it in the same directory as LeagueClient.exe
      const possiblePaths = [
        "C:\\Riot Games\\League of Legends\\lockfile",
        "D:\\Riot Games\\League of Legends\\lockfile",
        "C:\\Program Files\\Riot Games\\League of Legends\\lockfile",
        "C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile"
      ];
      
      // Return the first existing path
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
      
      // Default path
      return "C:\\Riot Games\\League of Legends\\lockfile";
    } else {
      // macOS
      return '/Applications/League of Legends.app/Contents/LoL/lockfile';
    }
  }
}
