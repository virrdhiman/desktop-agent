# Sync commits to the source checkout later

The source checkout on `D:` is read-only for this QA run. After reviewing the
commits and making sure no process is using either checkout, run this command
from an elevated PowerShell window when you intentionally want to transfer the
commits back:

```powershell
git -C 'D:\pers\Desktop Agent' fetch 'C:\vd-vms\repo' 'qa/human-tests'; git -C 'D:\pers\Desktop Agent' switch qa/human-tests; git -C 'D:\pers\Desktop Agent' merge --ff-only FETCH_HEAD
```

This file is guidance only and was not executed during the locked QA run.

The QA branch also contains the human-style test scripts, the live failover
evidence, and the dry-run cleanup helper. The locked QA run created the
read-only storage report at
`C:\vd-vms\D-CLEANUP-CANDIDATES.md`; it did not modify D: and did not include
that report in the source checkout. Review it separately before deciding on
any cleanup.
