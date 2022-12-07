// External
import chalk from 'chalk';
import fs from 'node:fs';
import geojsonPrecision from 'geojson-precision';
import geojsonRewind from '@mapbox/geojson-rewind';
import glob from 'glob';
import JSON5 from 'json5';
import jsonschema from 'jsonschema';
import path from 'node:path';

// JSON
import geojsonSchemaJSON from '../schema/geojson.json' assert {type: 'json'};
import geometrySchemaJSON from '../schema/geometry.json' assert {type: 'json'};

const Validator = jsonschema.Validator;
let v = new Validator();
v.addSchema(geojsonSchemaJSON, 'http://json.schemastore.org/geojson.json');

collectRegions();

//
// collectRegions()
// Gather all the regions from `assets/regions/**/*.geojson`
//
function collectRegions() {
  console.log('');
  console.log(chalk.yellow('Building regions...'));
  console.time(chalk.green('regions built'));
  let regions = [];
  let files = {};

  glob.sync('assets/regions/**/*', { nodir: true }).forEach(file => {
    if (/\.md$/i.test(file) || /LICENSE$/i.test(file)) return;  // ignore markdown/readme files

    if (!/\.geojson$/.test(file)) {
      console.error(chalk.red(`Error - file should have a .geojson extension:`));
      console.error('  ' + chalk.yellow(file));
      process.exit(1);
    }

    const contents = fs.readFileSync(file, 'utf8');
    let parsed;
    try {
      parsed = JSON5.parse(contents);
    } catch (jsonParseError) {
      console.error(chalk.red(`Error - ${jsonParseError.message} in:`));
      console.error('  ' + chalk.yellow(file));
      process.exit(1);
    }

    let geometry = geojsonPrecision(geojsonRewind(parsed, false), 5);
    const gc = geometry.regions;

    // A GeometryCollection with a single geometry inside (polygons.openstreetmap.fr likes to make these).
    if (geometry.type === 'GeometryCollection') {
        console.error(chalk.red('Invalid GeoJSON - GeometryCollection with a single geometry should be avoided in favor of single part or a single object of multi-part type:'));
        console.error('  ' + chalk.yellow(file));
        process.exit(1);
    }

    // sort properties
    let obj = {};
    if (geometry.type)  { obj.type = geometry.type; }

    if (geometry) {
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
        console.error(chalk.red('Error - Type must be "Polygon" or "MultiPolygon" in:'));
        console.error('  ' + chalk.yellow(file));
        process.exit(1);
      }
      if (!geometry.coordinates) {
        console.error(chalk.red('Error - Geometry missing coordinates in:'));
        console.error('  ' + chalk.yellow(file));
        process.exit(1);
      }
      obj = {
        type: geometry.type,
        coordinates: geometry.coordinates
      };
    }

    geometry = obj;

    validateFile(file, geometry, geometrySchemaJSON);

    const filename = path.basename(file).toLowerCase();

    if (files[filename]) {
      console.error(chalk.red('Error - Duplicate filenames: ') + chalk.yellow(filename));
      console.error('  ' + chalk.yellow(files[id]));
      console.error('  ' + chalk.yellow(file));
      process.exit(1);
    }
    regions.push(geometry);
    files[filename] = file;
  });

  const regionCount = Object.keys(files).length;
  console.log(`region count:\t${regionCount}`);
  console.timeEnd(chalk.green('regions built'));
  console.log('');
  return regions;
}

//
// validateFile()
// Performs JSON schema validation on the file.
//
function validateFile(file, resource, schema) {
  const validationErrors = v.validate(resource, schema).errors;
  if (validationErrors.length) {
    console.error(chalk.red('Error - Schema validation:'));
    console.error('  ' + chalk.yellow(file + ': '));
    validationErrors.forEach(error => {
      if (error.property) {
        console.error('  ' + chalk.yellow(error.property + ' ' + error.message));
      } else {
        console.error('  ' + chalk.yellow(error));
      }
    });
    process.exit(1);
  }
}