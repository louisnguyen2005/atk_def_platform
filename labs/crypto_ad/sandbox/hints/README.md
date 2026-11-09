# Hint files installed on each team VM

Open `/home/user-access/crypto-lab/hints/README.md` on the VM. The full example implementation is in `/home/user-access/crypto-lab/src/`. Challenge services speak newline-delimited JSON; use `ncat 10.81.0.11 9011`, then type one JSON object and press Enter. For the other team, change the VM address to `10.81.0.12`.

Each task has three hints. The last hint names the recovery step without printing a flag. Flags use `MekoDataCTF{` followed by 32 lowercase hexadecimal digits and `}`. Submit a captured opponent flag through the MekoDataCTF scoreboard while your team token is active.
