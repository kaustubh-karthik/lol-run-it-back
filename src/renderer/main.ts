'use strict';
import {Client} from "../main/models/league-client";

console.log('Renderer process starting...');

try {
  console.log('Setting up title...');
  const title = document.createElement('title');
  title.innerHTML = 'LoL - Run it Back!';
  document.head.appendChild(title);

  console.log('Finding container...');
  const container = document.querySelector('#app');
  if (!container) {
    console.error('Container #app not found in the DOM!');
  } else {
    console.log('Container found:', container);
  }

  console.log('Importing components...');
  import('./components/run-it-back-app').then(() => {
    console.log('Components imported successfully');

    console.log('Creating app component...');
    const app: any = document.createElement('run-it-back-app');
    app.client = new Client;
    console.log('Client attached to app');

    console.log('Appending app to container...');
    container.appendChild(app);
    console.log('App appended to container');
  }).catch(err => {
    console.error('Error importing components:', err);
  });
} catch (error) {
  console.error('Error in renderer setup:', error);
}
