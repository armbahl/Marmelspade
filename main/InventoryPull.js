import fs from 'fs';

const CONFIG = "./Config.json"; // Config file path
const RESO_APIURL = "https://api.resonite.com"; // Base API URL

// GET requests
async function getRequest(url, user, path) {
    const query = encodeURIComponent(path); // Converts inventory path to URL encoded format
    const urlWithQuery = `${url}/users/${user}/records?path=${query}`; // Adds query to base URL
    const response = await fetch(urlWithQuery, {method: 'GET'}); // Fetches data from API
    const contentType = response.headers.get('content-type'); // Gets content type from response headers

    let data; // Variable to hold response data

    // Parses response based on content type
    if (contentType && contentType.includes('application/json')) {
    data = await response.json();
    }
    else {
    data = await response.text();
    }
    
    return data; // Returns the parsed data
}

// Main function to pull inventory and save to JSON files
export async function inventoryDump() {
    const mainConfig = JSON.parse(fs.readFileSync(
        `./${CONFIG}`, (err) => {if (err) throw err})); // Reads user id's and associated inventory paths from config file
    
    if (!fs.existsSync('_RAW_JSON')) {fs.mkdirSync('_RAW_JSON');} // Creates directory for raw JSON files if it doesn't exist

    let pulledDirs = []; // Array to hold pulled directories
    let currentData; // Variable to hold current data from API
    let fileNumber = 0; // Counter for naming JSON files

    // Loop through each index in "locations" within config file
    for (let initDirs in mainConfig["locations"]) {
        pulledDirs.length = 0; // Clears array for each iterated index
        pulledDirs.push(mainConfig["locations"][initDirs]["directory"]); // Adds initial directory to array

        // Recursively pulls directories and saves data to JSON files
        while (pulledDirs.length > 0) {
            currentData = await getRequest(RESO_APIURL, mainConfig["locations"][initDirs]["id"], pulledDirs[0]); // Fetches data

            // Finds subdirectories and adds them to the array
            for (let i in currentData) {
                console.log(pulledDirs[0]);
                if (currentData[i]["recordType"] === "directory") {
                    pulledDirs.push(currentData[i]["path"] + "\\" + currentData[i]["name"]);
                }
            }
            
            fs.writeFileSync(`_RAW_JSON/${fileNumber}.json`, JSON.stringify(currentData, null, 2)); // Writes JSON data to file
            fileNumber += 1; // Increments for file naming

            pulledDirs.shift(); // Removes the processed directory from the beginning of the array
        }
    }
}
