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
### (SECT_1) LOGIN CHECKS AND LOGIC
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
        password = input("Password: ")
        headerUID = secrets.token_hex(32)
        headerTOTP = input("2FA (leave blank if not using): ")

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
### (SECT_3) ACTIONS
##############################################

def LinkDirectory(aUri):
    removedResRec = aUri[10:]
    sliceIndex = removedResRec.find("/")
    ownerID = removedResRec[:(sliceIndex)]
    uriID = removedResRec[(sliceIndex + 1):]

    gReq = requests.get(f"https://api.resonite.com/users/{ownerID}/records/{uriID}").json()

    return gReq["path"]


def InventoryDump():
    # userActual = input("Input owner's user ID (NOT USERNAME): ")
    # pathStart = "Inventory\\"
    # pathInp = input("Input starting folder path (CASE SENSITIVE): ")
    # pathActual = pathlib.PureWindowsPath(pathInp)

    userActual = "U-TEST"
    groupAcutal = "G-TEST"
    pathInp = "Inventory/TEST"
    pathActual = pathlib.PureWindowsPath(pathInp)
    dirName = pathlib.PureWindowsPath(pathInp).stem
    
    gSubDirs = []

    gReq = requests.get(f"{RESO_URL}/users/{userActual}/records", \
                          headers = authHeaders, \
                          params={"path": pathActual}).json()
    gLength = len(gReq)

    with open(DUMP_PATH + 'FULL_' + dirName + '.json', 'w') as f:
        f.write(json.dumps(gReq, indent=4))

    counter = 0
    for x in range(gLength):
        if gReq[x]["recordType"] == "directory" and (gReq[x]["ownerId"] == (userActual or groupAcutal)):
            gSubDirs.append(gReq[x]["path"] + "\\" + gReq[x]["name"])

        elif gReq[x]["recordType"] == "link" and (gReq[x]["ownerId"] == (userActual or groupAcutal)):
            counter += 1
            print(f"Links converted: {counter}")
            gSubDirs.append(LinkDirectory(gReq[x]["assetUri"]) + "\\" + gReq[x]["name"])
            print("\x1B[1A\x1B[2K", end="")

    with open(DUMP_PATH + 'DIRS_' + dirName + '.txt', 'w') as f:
        daLength = len(gSubDirs)
        for x in range(daLength):
            f.write(gSubDirs[x] + "\n")