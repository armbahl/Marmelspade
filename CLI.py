import os
from Utils import ClrScr
import API.Master as API

##############################################
### (SECT_0) FUNCS
##############################################

### Main menu ###
def MenuSelect(menuOpt):
    ClrScr()

    while menuOpt == True:
        print("Welcome to Marmelspade!\n" +\
            "Please select an option:\n\n" +\
                
            "1) Pull Inventory\n" +\
            "9) Exit\n" +\
            "99) LOGOUT\n")

        usrInp = int(input("<SELECTION>: "))

        match usrInp:
            case 1: # Dump the inventory into raw files
                API.InventoryDump()
                ClrScr()

            case 9: # Exit the program
                menuOpt = False
                ClrScr()
                print("Thank you for using Marmelspade!\n")

            case 99: # Logout
                ClrScr()
                API.ResoLogout()
                menuOpt = False
                print("Thank you for using Marmelspade!\n")

            case _:
                print("WRONG INPUT")

### Login checker ###
def LoginProc():
    if API.ResoLogin():
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