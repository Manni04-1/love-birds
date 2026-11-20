// Makes the release build sign with Love Birds' own key instead of the debug key that
// `expo prebuild` sets up. The keystore's path and password come from the environment
// (LOVE_BIRDS_KEYSTORE and LOVE_BIRDS_KEYSTORE_PASSWORD), set by signing-key.sh.
const fs = require('fs');

const file = process.argv[2];
let gradle = fs.readFileSync(file, 'utf8');

const configs = gradle.indexOf('signingConfigs {');
if (configs < 0) throw new Error(`No signingConfigs block in ${file}`);
const at = configs + 'signingConfigs {'.length;
gradle =
  gradle.slice(0, at) +
  `
        release {
            storeFile file(System.getenv('LOVE_BIRDS_KEYSTORE'))
            storePassword System.getenv('LOVE_BIRDS_KEYSTORE_PASSWORD')
            keyAlias 'lovebirds'
            keyPassword System.getenv('LOVE_BIRDS_KEYSTORE_PASSWORD')
        }` +
  gradle.slice(at);

// The release build type is the one inside buildTypes, after the debug one.
const types = gradle.indexOf('buildTypes {');
const release = types < 0 ? -1 : gradle.indexOf('release {', types);
const line = release < 0 ? -1 : gradle.indexOf('signingConfig signingConfigs.debug', release);
const end = release < 0 ? -1 : gradle.indexOf('\n        }', release);
if (line < 0 || line > end) throw new Error(`No debug signing in the release build type of ${file}`);
gradle = gradle.slice(0, line) + 'signingConfig signingConfigs.release' + gradle.slice(line + 'signingConfig signingConfigs.debug'.length);

fs.writeFileSync(file, gradle);
console.log('The release build signs with the Love Birds key.');
