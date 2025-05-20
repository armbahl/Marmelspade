### Clears console screen ###
def ClrScr():
    print("\x1B[H\x1B[J", end="")