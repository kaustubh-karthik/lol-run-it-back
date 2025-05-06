import argparse
import time
import requests
import asyncio
import json
import subprocess
import sys
import os
from lcu_driver import Connector
import psutil

# Disable insecure request warnings (LCU API uses self-signed cert)
requests.packages.urllib3.disable_warnings(requests.packages.urllib3.exceptions.InsecureRequestWarning)

connector = Connector()

def is_league_client_running():
    """Check if League client is running by looking for LeagueClient.exe in process list."""
    for proc in psutil.process_iter(['name']):
        try:
            if proc.info['name'] and 'LeagueClient.exe' in proc.info['name']:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return False

def open_league_client():
    """Attempts to open the League of Legends client."""
    print("Attempting to open League of Legends client...")
    try:
        if sys.platform == "win32":
            # Default paths for Windows
            possible_paths = [
                r"C:\Riot Games\League of Legends\LeagueClient.exe",
                r"D:\Riot Games\League of Legends\LeagueClient.exe",
                r"C:\Program Files\Riot Games\League of Legends\LeagueClient.exe",
                r"C:\Program Files (x86)\Riot Games\League of Legends\LeagueClient.exe"
            ]
            
            for path in possible_paths:
                if os.path.exists(path):
                    print(f"Found League client at: {path}")
                    subprocess.Popen([path])
                    print("League client launch initiated, waiting for it to start...")
                    return True
                    
            print("Could not find League client. Please open it manually.")
            return False
            
        elif sys.platform == "darwin":
            # macOS
            subprocess.Popen(["open", "/Applications/League of Legends.app"])
            print("League client launch initiated, waiting for it to start...")
            return True
            
        else:
            print(f"Unsupported platform: {sys.platform}")
            return False
            
    except Exception as e:
        print(f"Error launching League client: {e}")
        return False

async def watch_replay(connection, game_id):
    """Downloads and launches the replay for the given game_id."""
    try:
        # Check if the game metadata is available first
        print(f"Checking metadata for game ID: {game_id}")
        metadata_endpoint = f'/lol-replays/v1/metadata/{game_id}'
        metadata_response = await connection.request('get', metadata_endpoint)
        
        if metadata_response.ok:
            metadata = await metadata_response.json()
            print(f"Initial metadata: {json.dumps(metadata, indent=2)}")
            
            # If the state is already 'watch', no need to download
            if metadata.get('state') == 'watch':
                print("Replay is already downloaded and ready to watch.")
            else:
                # Need to download the replay
                await download_and_wait(connection, game_id)
        else:
            # Metadata not found, need to directly download the replay
            status = metadata_response.status
            print(f"Metadata not available (HTTP {status}), initiating download...")
            await download_and_wait(connection, game_id)

        # Watch replay
        print(f"Launching replay for game ID: {game_id}")
        watch_endpoint = f'/lol-replays/v1/rofls/{game_id}/watch'
        # Include an empty contextData object in the request
        watch_response = await connection.request('post', watch_endpoint, data={'contextData': {}})
        
        if watch_response.ok:
            print("Replay launched successfully!")
            return True
        else:
            try:
                error_data = await watch_response.json()
                print(f"Error launching replay: HTTP {watch_response.status} - {error_data}")
            except:
                print(f"Error launching replay: HTTP {watch_response.status}")
            return False

    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()
        return False

async def download_and_wait(connection, game_id):
    """Download replay and wait for it to be ready"""
    print(f"Requesting download for game ID: {game_id}")
    # Request download
    download_endpoint = f'/lol-replays/v1/rofls/{game_id}/download'
    # Include an empty contextData object in the request
    download_response = await connection.request('post', download_endpoint, data={'contextData': {}})
    
    if not download_response.ok:
        status = download_response.status
        try:
            error_data = await download_response.json()
            print(f"Error downloading replay: HTTP {status} - {error_data}")
            return False
        except:
            print(f"Error downloading replay: HTTP {status}")
            return False
    
    print("Waiting for download to complete...")
    # Wait for download to finish
    max_attempts = 120  # Cap the waiting at 60 seconds (120 * 0.5)
    attempt = 0
    
    valid_states = ['checking', 'downloading']
    finished_state = 'watch'
    metadata_endpoint = f'/lol-replays/v1/metadata/{game_id}'
    
    while attempt < max_attempts:
        attempt += 1
        metadata_response = await connection.request('get', metadata_endpoint)
        if not metadata_response.ok:
            try:
                error_data = await metadata_response.json()
                print(f"Error checking replay status: {error_data}")
            except:
                print(f"Error checking replay status: HTTP {metadata_response.status}")
            return False
        
        metadata = await metadata_response.json()
        state = metadata.get('state')
        print(f"  Current state: {state}")
        
        if state == finished_state:
            print("Download complete.")
            return True
        elif state in valid_states:
            await asyncio.sleep(0.5)
        else:
            print(f"Unexpected replay state: {state}")
            print(f"Full metadata: {json.dumps(metadata, indent=2)}")
            if 'errorCode' in metadata:
                print(f"Error code: {metadata['errorCode']}")
            if 'errorString' in metadata:    
                print(f"Error string: {metadata['errorString']}")
            return False
    
    print("Timed out waiting for the replay to download.")
    return False

@connector.ready
async def connect(connection):
    print("LCU API connection established.")
    parser = argparse.ArgumentParser(description='Launch a League of Legends replay by Game ID.')
    parser.add_argument('game_id', type=int, help='The Game ID of the replay to watch.')
    parser.add_argument('--check-only', action='store_true', help='Only check metadata without downloading')
    args = parser.parse_args()

    if args.check_only:
        # Just check metadata
        metadata_endpoint = f'/lol-replays/v1/metadata/{args.game_id}'
        metadata_response = await connection.request('get', metadata_endpoint)
        if metadata_response.ok:
            metadata = await metadata_response.json()
            print(f"Metadata for game {args.game_id}:")
            print(json.dumps(metadata, indent=2))
        else:
            try:
                error_data = await metadata_response.json()
                print(f"Error getting metadata: HTTP {metadata_response.status} - {error_data}")
            except:
                print(f"Error getting metadata: HTTP {metadata_response.status}")
    else:
        # Normal operation
        success = await watch_replay(connection, args.game_id)
        if success:
            print("Operation completed successfully.")
        else:
            print("Operation failed.")
    
    # Exit the script
    print("Exiting script.")
    # Don't try to close the connection

@connector.close
async def disconnect(_):
    print("LCU API connection closed.")

# First check if a League client is already running
print("Checking if League client is already running...")
if not is_league_client_running():
    print("League client not detected.")
    if open_league_client():
        print("Waiting for League client to initialize...")
        time.sleep(10)  # Give it some time to start up
    else:
        print("Please start the League client manually before running this script.")
else:
    print("League client is already running.")

print("Waiting for League client connection...")

try:
    connector.start()
except KeyboardInterrupt:
    print("\nScript interrupted by user.")
except Exception as e:
    print(f"An error occurred during script execution: {e}")
    import traceback
    traceback.print_exc() 