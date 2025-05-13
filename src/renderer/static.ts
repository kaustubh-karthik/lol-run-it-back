import path from 'path';
import url from 'url';

const isDevelopment = process.env.NODE_ENV !== 'production';
console.log('Static module: NODE_ENV =', process.env.NODE_ENV);
console.log('Static module: isDevelopment =', isDevelopment);

// Improved static asset path resolution
export function getStatic(val) {
  console.log(`Getting static asset: ${val}, isDevelopment: ${isDevelopment}`);

  let result;
  if (isDevelopment) {
    // In development mode, resolve to the local server
    result = url.resolve(window.location.origin, `static/${val}`);
    console.log(`Development path: ${result}`);
  } else {
    try {
      console.log('Attempting to use __static path...');
      // @ts-ignore
      const staticPath = __static;
      console.log('__static =', staticPath);
      // In production mode, use __static path
      result = path.join(staticPath, val);
      console.log(`Production path (using __static): ${result}`);
    } catch (e) {
      console.error('Error with __static:', e);
      // Fallback if __static is not available
      try {
        console.log('process.resourcesPath =', process.resourcesPath);
        result = path.join(process.resourcesPath, 'static', val);
        console.log(`Production path (using resourcesPath): ${result}`);
      } catch (e2) {
        console.error('Error with resourcesPath:', e2);
        // Ultimate fallback - use a relative path
        result = `./static/${val}`;
        console.log(`Fallback path: ${result}`);
      }
    }
  }
  
  return result;
}
