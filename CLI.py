import os
import API.Master as API

##############################################
### (SECT_0) FUNCS
##############################################

### Clears console screen ###
def ClrScr():
    print("\x1B[H\x1B[J", end="")

### Main menu ###
def MenuSelect(menuOpt):
    ClrScr()
    print("Welcome to Marmelspade!\n")
    while menuOpt == True:
        print("Please select an option:\n\n"+\
                
            "1) Pull Inventory (Manual)\n"+\
            "2) Pull Inventory (Config File)\n"+\
            "3) Sort JSON for web\n"+\
            "4) Create Database\n"+\
            "0) Exit\n"+\
            "999) LOGOUT\n")

        usrInp = int(input("<SELECTION>: "))

        match usrInp:
            case 1: # Dump the inventory into raw files
                API.InventoryDump(0)
                ClrScr()
                print("Pulled inventory!")

            case 2: # Uses config for pull targets
                API.InventoryDump(1)
                ClrScr()
                print("Pulled inventory!")
            
            case 3: # Sorts JSON for web
                API.JsonPrune()
                ClrScr()
                print("JSON sorted!")

            case 4: # Creates SQLite database from JSON files
                API.CreateDatabase()
                ClrScr()
                print("Database created!")

            case 0: # Exit the program
                menuOpt = False
                ClrScr()
                print("Thank you for using Marmelspade!\n")

            case 999: # Logout
                ClrScr()
                API.ResoLogout()
                menuOpt = False
                print("Thank you for using Marmelspade!\n")

            case _:
                print("WRONG INPUT")

### Login checker ###
def LoginProc():
    if API.ResoLogin(True, None, None):
        MenuSelect(True)
    else:
        pass

##############################################
### (SECT_MAIN) EXECUTION
##############################################

tokenExists = API.TokenFileCheck() # Checks for AUTH_TOKEN.json
tokenExpired = API.ExpireCheck(2) # Checks for days passed since token was created using int var

### If the token file does not exist, propmpts login ###
if tokenExists == False:
    ClrScr()
    LoginProc()

### If token file is over two days old, logs the user out, deletes token, and prompts login ###
elif tokenExpired == True:
    ClrScr()
    print("Token is too old! You will be logged out for safety.")
    API.ResoLogout()
    ClrScr()
    LoginProc()

### If token is valid and within timeframe, opens main menu ###
else:
    MenuSelect(True)