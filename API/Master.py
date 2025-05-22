import datetime
import getpass
import json
import os
import pathlib
import pprint
import requests
import time
import secrets
from Utils import ClrScr

##############################################
### (SECT_0) CONSTANTS
##############################################

DUMP_PATH = "DEBUG\\"
RESO_URL = "https://api.resonite.com"
TOKEN_PATH = "AUTH_TOKEN.json"

##############################################
### (SECT_1) LOGIN CHECKS AND VARIABLES
##############################################

### Token age check ###
def ExpireCheck(expDays):
    if os.path.isfile(TOKEN_PATH):
        tokenTimestamp = os.path.getmtime(TOKEN_PATH)
        currentTime = time.time()
        elapsedDays = datetime.timedelta(seconds=(currentTime - tokenTimestamp)).days

        if elapsedDays > expDays:
            return True
        else:
            return False
    else:
        print("ERROR E101:\nEXPIRE NOT WORKING")

authUser = None
authToken = None
authHeaders = None

### Token file existence check and reading ###
def TokenFileCheck():
    global authUser
    global authToken
    global authHeaders

    if os.path.exists(TOKEN_PATH) == True:
        with open(TOKEN_PATH) as f:
            readFile = json.load(f) # Load json
        authUser = readFile["entity"]["userId"] # User ID from json
        authToken = readFile["entity"]["token"] # Token from json
        authHeaders = {"Authorization": f"res {authUser}:{authToken}"} # Prep header
        return True
    
    else:
        return False

def HashGen():
### Machine ID generation ###
    z = secrets.token_hex(16) # Random number
    x = 8 # Sring slicer offset

    for y in range(4): # Adds dashes required for POST
        match y:
            case 0:
                z = z[ :x] + "-" + z[x: ]
            case 1:
                y += 5
                z = z[ :x] + "-" + z[x: ]
            case 2:
                y += 5
                z = z[ :x] + "-" + z[x: ]
            case 3:
                y += 5
                z = z[ :x] + "-" + z[x: ]
    
    return z # Returns machine ID string

##############################################
### (SECT_2) LOGIN/LOGOUT HANDLING
##############################################

### Login handler ###
def ResoLogin():
    loopCheck = True
    while loopCheck == True:
        username = input("\x1B[HUsername: ")
        password = getpass.getpass(prompt="Password: ")
        headerUID = secrets.token_hex(32)
        headerTOTP = getpass.getpass(prompt="2FA (leave blank if not using): ")

        pHeaders = {"UID": headerUID, "TOTP": headerTOTP}
        pLogin = {"username": username,
                "authentication": {"$type": "password", "password": password},
                "secretMachineId": HashGen(),
                "rememberMe": True
        }

        pReq = requests.post(f"{RESO_URL}/userSessions", \
                               headers=pHeaders, \
                               json=pLogin) # POST request

        if pReq.status_code == 200: # Success
            with open(TOKEN_PATH, "w") as f:
                f.write(json.dumps(pReq.json(), indent=4))

            loopCheck = False
            return True
            print("LOGGED IN")

        elif pReq.status_code == 400: # Invalid username/password
            logTryAgain = input("INCORRECT LOGIN INFO!\n" +\
                                "Try again?\n" +\
                                "(Y)/N: ")
            match logTryAgain.upper():
                case "N":
                    loopCheck = False
                    return loopCheck
                    
                case _:
                    print("\x1B[H\x1B[J")
                    loopCheck = True

        else: # ERROR (A101)
            print(pReq.status_code)
            print(pReq.reason)
            loopCheck == False

### Logout handler ###
def ResoLogout():
    TokenFileCheck()
    dPath = f"{RESO_URL}/userSessions/{authUser}/{authToken}" # Prep URL

    dReq = requests.delete(dPath, headers=authHeaders) # DELETE request

    if dReq.status_code == 200: # Success
        print("LOGGED OUT")
        os.remove(TOKEN_PATH)
        return True
    
    elif dReq.status_code == 409: # Not logged in
        print("ALREADY LOGGED OUT")
        return False

    else: # ERROR (B101)
        print(f"ERROR B101:\n{dReq.status_code}\n{dReq.reason}")
        return False

##############################################
### (SECT_3) INVENTORY FUNCTIONS
##############################################

### Parses directory path from link type ###
def LinkDirectory(aUri):
    removedResRec = aUri[10:] # Removes "resrec:///"
    sliceIndex = removedResRec.find("/") # Finds first forward slash 
    ownerID = removedResRec[:(sliceIndex)] # Loads username
    uriID = removedResRec[(sliceIndex + 1):] # Loads URI

    gReq = requests.get(f"https://api.resonite.com/users/{ownerID}/records/{uriID}").json() # Gets link JSON

    return [gReq["ownerId"], gReq["path"]] # Returns the user ID and path within their inventory

### Dumps the inventory starting from the user provided directory ###
def InventoryDump():
    userActual = input("Input owner's user ID (CASE SENSITIVE): ") # Input of owner's ID
    pathInp = "Inventory/" + input("Input starting folder path (CASE SENSITIVE): ") # Input of starting directory
    pathActual = pathlib.PureWindowsPath(pathInp) # Initial directory formatting
    
    gDirs = [pathActual] # List for directories
    gSubLinks = [] # List for links

    loopCatch = 0
    loopMax = 2
    while loopCatch < loopMax:
        dirName = pathlib.PureWindowsPath(gDirs[loopCatch]).stem # Loads current directory name

        gReq = requests.get(f"{RESO_URL}/users/{userActual}/records", \
                            headers = authHeaders, \
                            params={"path": gDirs[loopCatch]}).json() # Gets directory JSON from API

        with open(f"{DUMP_PATH}\\INV_{dirName}.json", 'w') as f: # Writes JSON to file
            f.write(json.dumps(gReq, indent=4))

        gLength = len(gReq) # Counts items within JSON

        for x in range(gLength):
            if gReq[x]["recordType"] == "directory": # Checks if the entry is a directory
                print(gReq[x]["path"] + "\\" + gReq[x]["name"]) # Prints directory to console
                gDirs.append(gReq[x]["path"] + "\\" + gReq[x]["name"]) # Adds directory to list

            elif gReq[x]["recordType"] == "link": # Checks if the entry is a public folder
                gSubLinks.append(gReq[x]["assetUri"]) #---------- TO DO ----------#

        loopMax = len(gDirs) # Dynamically resizes based on how many items are in the directory list
        loopCatch += 1 # Increment for loop iteration
    
    #-- DEBUG: Writes directories to single file --#
    # with open(f"{DUMP_PATH}\\_DIRS.txt", 'w') as f:
    #     for x in range(len(gDirs)):
    #         f.write(f"{RESO_URL}/users/{userActual}/records/{gDirs[x]}\n")