MY TASKS FOR WINDOWS

Double-click "Launch My Tasks.cmd". The shared HTTPS task website opens in its own Microsoft Edge app window.

Windows and iPhone now use the same signed-in task list. This launcher does not run a local server or maintain a separate data\tasks.json file.

An internet connection is required to load or save the shared task list.

DIRECT COMMAND HELPER

"Manage-MyTasks.ps1" reads and updates the shared server data without opening a browser. Its password file is encrypted to the current Windows account.

Examples from PowerShell:
  .\Manage-MyTasks.ps1 list
  .\Manage-MyTasks.ps1 add "Buy milk"
  .\Manage-MyTasks.ps1 complete "Buy milk"
  .\Manage-MyTasks.ps1 uncomplete "Buy milk"
  .\Manage-MyTasks.ps1 edit "Buy milk" -NewTitle "Buy groceries"
  .\Manage-MyTasks.ps1 delete "Buy groceries"
  .\Manage-MyTasks.ps1 list -Json

To replace the encrypted password:
  .\Manage-MyTasks.ps1 credential
