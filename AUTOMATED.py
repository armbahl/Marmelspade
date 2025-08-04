import os
from CLI import ClrScr
import API.Master as API

##############################
### AUTO LOGIN CREDENTIALS ###
##############################
resoUsername = None # Resonite username
resoPassword = None # Resonite password
##############################

### Pull Operation ###
def Ops():
    API.InventoryDump(1)
    API.JsonPrune()

### Login Handler ###
def LoginProc():
    if API.ResoLogin(False, resoUsername, resoPassword):
        Ops()
    else:
        pass

tokenExists = API.TokenFileCheck() # Checks for AUTH_TOKEN.json
tokenExpired = API.ExpireCheck(28) # Checks for days passed since token was created using int var

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
    Ops()