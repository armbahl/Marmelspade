import fs from 'fs';
import { execSync, exec } from 'child_process';

const CONFIG = "./Config.json"; // Config file path
const RESO_APIURL = "https://api.resonite.com"; // Base API URL

async function GetRequest(url, user, path) {
    const query = encodeURIComponent(path);
    const urlWithQuery = `${url}/users/${user}/records?path=${query}`;
    const response = await fetch(urlWithQuery, {method: 'GET'});
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
    data = await response.json();
    }
    else {
    data = await response.text();
    }
    
    return data;
}

export async function InventoryDump() {
    const mainConfig = JSON.parse(fs.readFileSync(
        `./${CONFIG}`, (err) => {if (err) throw err}));
    
    if (!fs.existsSync('_RAW_JSON')) {fs.mkdirSync('_RAW_JSON');}

    let pulledDirs = [];
    let currentData;
    let fileNumber = 0;

    for (let initDirs in mainConfig["locations"]) {
        pulledDirs.length = 0;
        pulledDirs.push(mainConfig["locations"][initDirs]["directory"]);

        while (pulledDirs.length > 0) {
            currentData = await GetRequest(RESO_APIURL, mainConfig["locations"][initDirs]["id"], pulledDirs[0]);
            for (let i in currentData) {
                console.log(pulledDirs[0]);
                if (currentData[i]["recordType"] === "directory") {
                    pulledDirs.push(currentData[i]["path"] + "\\" + currentData[i]["name"]);
                }
            }
            
            fs.writeFileSync(`_RAW_JSON/${fileNumber}.json`, JSON.stringify(currentData, null, 2));
            fileNumber += 1;

            pulledDirs.shift();
        }
    }
}

export function ExportToMongoDB() {
    const files = fs.readdirSync('./_RAW_JSON');
        for (let i in files) {
            try {
                execSync(`mongoimport --db=test --collection=CJ --file=./_RAW_JSON/${i}.json --jsonArray`, {stdio: 'inherit'});
            }
            catch (err) {
                console.error(`Error importing file ${i}.json:`, err.message);
            }
        }
}