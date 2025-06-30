import configparser
import datetime
import getpass
import json
import os
import pathlib
import pprint
import requests
import time
import secrets
import sqlite3
import sys

##############################################
### (SECT_0) CONSTANTS
##############################################

DUMP_PATH = "_JSON"
RESO_APIURL = "https://api.resonite.com"
RESO_ASSETURL = "https://assets.resonite.com"
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
        print("ERROR E101:\nEXPIRE CHECK ERROR")

authUser = None
authToken = None
authHeaders = None

### Token file existence check and reading ###
def TokenFileCheck():
    try:
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
    except:
        print("ERROR E102:\nTOKEN CHECK NOT WORKING")
        sys.exit(0)

### Machine ID generation ###
def HashGen():
    try:
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
    except:
        print("ERROR 103:\nMACHINE HASH NOT GENERATED")
        sys.exit(0)

##############################################
### (SECT_2) LOGIN/LOGOUT HANDLING
##############################################

### Login handler ###
def ResoLogin():
    try:
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

            pReq = requests.post(f"{RESO_APIURL}/userSessions", \
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
    except:
        print("ERROR E104:\nLOGIN ERROR")
        sys.exit(0)

### Logout handler ###
def ResoLogout():
    try:
        TokenFileCheck()
        dPath = f"{RESO_APIURL}/userSessions/{authUser}/{authToken}" # Prep URL

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
    except:
        print("ERROR E105:\nLOGOUT ERROR")
        sys.exit(0)

##############################################
### (SECT_3) JSON RETRIEVAL AND PARSING
##############################################

### Dumps the inventory starting from the user provided directory ###
def InventoryDump(methodSel):
    if os.path.isdir("_JSON"): # Checks for "_JSON" directory and writes if not existing
        pass
    else:
        os.mkdir("_JSON")

    config = configparser.ConfigParser() # For config reading
    userActual = [] # List for users/groups
    confDirs = [] # List for initial directories
    gDirs = [] # List for main loop directories

    if methodSel == 0: # Manual Input of directory
            userActual.append(input("Input owner's user or group ID (CASE SENSITIVE): ")) # Input of owner's ID)
            pathInp = input("Input starting folder path (CASE SENSITIVE): ") # Input of starting directory
            confFormatted = pathlib.PureWindowsPath(pathInp) # Formatted directory string
            confDirs.append("Inventory\\" + str(confFormatted)) # List for directories

    elif methodSel == 1: # Directories from "AutoConf.conf"
        if os.path.isfile("AutoConf.conf"):
            config.read("AutoConf.conf")
            confSections = config.sections()
            userActual = []

            for x in range(len(confSections)):
                userActual.append(config[confSections[x]]["User"]) # Usernames for directories
                confFormatted = pathlib.PureWindowsPath(config[confSections[x]]["Path"]) # Formatted directory string 
                confDirs.append("Inventory\\" + str(confFormatted)) # Appends path to initial directory list
        print(confDirs)

    for confIt in range(len(confDirs)):
        gDirs.clear() # Clears iteraion list
        gDirs.append(confDirs[confIt]) # Appends iterated directory to first position
        while gDirs: # Loops until all directories have been written
            dirName = pathlib.PureWindowsPath(gDirs[0]).stem # Loads current directory name

            gReq = requests.get(f"{RESO_APIURL}/users/{userActual[confIt]}/records", \
                                headers = authHeaders, \
                                params={"path": gDirs[0]}).json() # Gets directory JSON from API

            with open(f"{DUMP_PATH}/INV_{dirName}.json", 'w') as f: # Writes JSON to file
                f.write(json.dumps(gReq, indent=4))

            gLength = len(gReq) # Counts items within JSON

            for x in range(gLength):
                if gReq[x]["recordType"] == "directory": # Checks if the entry is a directory
                    print(gReq[x]["path"] + "\\" + gReq[x]["name"]) # Prints directory to console
                    gDirs.append(gReq[x]["path"] + "\\" + gReq[x]["name"]) # Adds directory to list

            gDirs.pop(0) # Removes current directory from list and loads next one

### Prunes the raw JSON files ###
def JsonPrune():
    parsedDir = "ParsedJSON" # Directory name

    if os.path.isdir(parsedDir): # Checks for directory and writes if not existing
        pass
    else:
        os.mkdir(parsedDir)

    dirList = os.listdir(DUMP_PATH) # Creates list with file names in dir

    pDir = [] # Directory list init
    pLin = [] # Link list init
    
    # Object list init
    pObj = [ 
            [],[],[],[],[],[],[],[],[],[],[],[],[],
            [],[],[],[],[],[],[],[],[],[],[],[],[],
            []
           ]

    # Letter index
    pLetters = [
                "A","B","C","D","E","F","G","H","I","J","K","L",
                "M","N","O","P","Q","R","S","T","U","V","W","X",
                "Y","Z","1"
               ]

    for x in range(len(dirList)): # Loops through json files in directory
        with open((f"{DUMP_PATH}/{dirList[x]}"), 'r') as f:
            jsonDump = json.load(f) # Loads JSON from file
        
        for y in range(len(jsonDump)): # Removes objects from JSON
            jsonDump[y].pop("version")
            # jsonDump[y].pop("tags")
            jsonDump[y].pop("isPublic")
            jsonDump[y].pop("isForPatrons")
            jsonDump[y].pop("isListed")
            jsonDump[y].pop("isReadOnly")
            jsonDump[y].pop("isDeleted")
            jsonDump[y].pop("creationTime")
            jsonDump[y].pop("lastModificationTime")
            jsonDump[y].pop("randomOrder")
            jsonDump[y].pop("visits")
            jsonDump[y].pop("rating")
            jsonDump[y].pop("ownerName")
            jsonDump[y].pop("ownerId")

            if jsonDump[y]["recordType"] == "directory": # Directory list append
                pDir.append(jsonDump[y])

            elif jsonDump[y]["recordType"] == "link": # Link list append
                pLin.append(jsonDump[y])

            else: # Object list append
                itemId = jsonDump[y]["id"] # resrec addition
                resrecId = f"resrec:///{itemId}"
                jsonDump[y].update({"resrecUri": resrecId})

                uriSliced = jsonDump[y]["thumbnailUri"] # Thumbnail URL addition
                thumbnailUrl = f"{RESO_ASSETURL}/{uriSliced[9:-5]}"
                jsonDump[y].update({"thumbnailUrl": thumbnailUrl})

                test = jsonDump[y]["name"][0].upper() # Matches first letter of object name and sets index

                match test:
                    case "A":
                        objIndex = 0
                    case "B":
                        objIndex = 1
                    case "C":
                        objIndex = 2
                    case "D":
                        objIndex = 3
                    case "E":
                        objIndex = 4
                    case "F":
                        objIndex = 5
                    case "G":
                        objIndex = 6
                    case "H":
                        objIndex = 7
                    case "I":
                        objIndex = 8
                    case "J":
                        objIndex = 9
                    case "K":
                        objIndex = 10
                    case "L":
                        objIndex = 11
                    case "M":
                        objIndex = 12
                    case "N":
                        objIndex = 13
                    case "O":
                        objIndex = 14
                    case "P":
                        objIndex = 15
                    case "Q":
                        objIndex = 16
                    case "R":
                        objIndex = 17
                    case "S":
                        objIndex = 18
                    case "T":
                        objIndex = 19
                    case "U":
                        objIndex = 20
                    case "V":
                        objIndex = 21
                    case "W":
                        objIndex = 22
                    case "X":
                        objIndex = 23
                    case "Y":
                        objIndex = 24
                    case "Z":
                        objIndex = 25
                    case _:
                        objIndex = 26

                pObj[objIndex].append(jsonDump[y]) # Appends object to proper final index

    # File writes
    subWrite = json.dumps(pDir, indent=4) # Directories
    finalWrite = subWrite[:-2]
    with open(f"{parsedDir}/_directories.json", "a") as f:
        f.write(f"{finalWrite}\n]")

    subWrite = json.dumps(pLin, indent=4) # Links
    finalWrite = subWrite[:-2]
    with open(f"{parsedDir}/_links.json", "a") as f:
        f.write(f"{finalWrite}\n]")

    for x in range(27): # Objects
        subWrite = json.dumps(pObj[x], indent=4)
        finalWrite = subWrite[:-2]
        with open(f"{parsedDir}/obj_{pLetters[x]}.json", "a") as f:
            f.write(f"{finalWrite}")

##############################################
### (SECT_4) DATABASE HANDLING
##############################################
def CreateDatabase():
    if not os.path.isfile("DATABASE.db"): # Creates SQlite database if one does not exist
        with sqlite3.connect("DATABASE.db") as conn:
                c = conn.cursor()

                itemTable = """CREATE TABLE "Items" (
                        "Name"	    TEXT NOT NULL,
                        "Link"	    TEXT NOT NULL,
                        "Path"	    TEXT NOT NULL,
                        "Thumbnail" TEXT NOT NULL
                        ); """
                c.execute(itemTable)

                folderTable = """CREATE TABLE "Public Folders" (
                        "Name"	TEXT NOT NULL,
                        "Link"	TEXT NOT NULL,
                        "Path"	TEXT NOT NULL
                        ); """
                c.execute(folderTable)

                worldTable = """CREATE TABLE "Worlds" (
                        "Name"	TEXT NOT NULL,
                        "Link"	TEXT NOT NULL,
                        "Tags"  TEXT NOT NULL,
                        "Path"	TEXT NOT NULL
                        ); """
                c.execute(worldTable)

    with sqlite3.connect("DATABASE.db") as conn: # Adds parsed info to database
        c = conn.cursor()

        for x in os.listdir("_JSON"): # Loops through json files in directory
            with open((f"_JSON/{x}"), 'r') as f:
                jsonDump = json.load(f)

                for y in range(len(jsonDump)):
                    dbTags = ""
                    dbLink = "resrec:///"+ str(jsonDump[y]["id"])

                    if jsonDump[y]["recordType"] == "object": # Item handling
                        dbTable = "Items"

                        for z in range(len(jsonDump[y]["tags"])): # Checks if the item is a world orb or not
                            if jsonDump[y]["tags"][z][:9] != "world_url":
                                dbTags += str(jsonDump[y]["tags"][z]) + " "

                            if jsonDump[y]["tags"][z] == "world_orb":
                                worldOrb = str(jsonDump[y]["tags"][z+1])[10:]
                                dbLink = worldOrb
                                dbTable = "Worlds"
                        
                        dbNameFIRST = str(jsonDump[y]["name"]) # Gets the name of the item
                        dbName = dbNameFIRST.replace("\"","'") # Replaces double quotes with single quotes
                        dbPath = jsonDump[y]["path"] # Path of the item within the game
                        
                        if dbTable == "Worlds": # Inserts world orb info into the proper table with tags
                            addTo = f'INSERT INTO {dbTable} VALUES ("{dbName}", "{dbLink}", "{dbTags}", "{dbPath}")'
                        else: # Inserts item info into the proper table without tags (not truly active in game yet)
                            uriSliced = jsonDump[y]["thumbnailUri"] # Thumbnail URL addition
                            dbThumbnail = f"{RESO_ASSETURL}/{uriSliced[9:-5]}"
                            addTo = f'INSERT INTO {dbTable} VALUES ("{dbName}", "{dbLink}", "{dbPath}", "{dbThumbnail}")'
                        c.execute(addTo)

                    elif jsonDump[y]["recordType"] == "link": # Inserts public folder links and info into the proper table
                        dbName = str(jsonDump[y]["name"])
                        dbLink = "resrec:///"+ str(jsonDump[y]["id"])
                        dbPath = jsonDump[y]["path"]
                        addTo = f'INSERT INTO "Public Folders" VALUES ("{dbName}", "{dbLink}", "{dbPath}")'
                        c.execute(addTo)
                    
                    else:
                        pass
