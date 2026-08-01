# One-time cPanel setup

Do these steps after deploying the committed code. No password or password hash belongs in Git, chat, `public_html`, or the repository checkout.

## 1. Deploy the pushed commit

In cPanel **Git Version Control**, open `/home/rylabsuueil3/repositories/gmscreen-clean-test`, choose **Update from Remote**, then **Deploy HEAD Commit**.

## 2. Create the private password configuration

Open **cPanel Terminal** and paste these commands. The password prompt is hidden, so the password does not appear on screen or in shell history.

```bash
mkdir -p /home/rylabsuueil3/task-app-private
chmod 700 /home/rylabsuueil3/task-app-private
read -s -p "Choose task password: " TASK_PASSWORD; echo
export TASK_PASSWORD
php -r '$p="/home/rylabsuueil3/task-app-private/config.php"; $h=password_hash(getenv("TASK_PASSWORD"), PASSWORD_DEFAULT); $c="<?php\nreturn [\n    \"password_hash\" => ".var_export($h,true).",\n    \"data_file\" => \"/home/rylabsuueil3/task-app-private/tasks.json\",\n];\n"; file_put_contents($p,$c); chmod($p,0600);'
unset TASK_PASSWORD
```

The application creates `tasks.json` on the first successful save. It also maintains `tasks.json.bak` and `tasks.json.lock` in this private directory.

## 3. Verify without exposing the hash

```bash
php -r '$c=require "/home/rylabsuueil3/task-app-private/config.php"; echo password_get_info($c["password_hash"])["algoName"], PHP_EOL;'
```

The expected result is `bcrypt`. Then open `https://bharmsasl.com/tasks/` (the deployed `index.html` forwards to the protected PHP entrypoint), sign in with the chosen password, add one harmless test task, refresh, and confirm it remains.

## Devices

- iPhone: open the HTTPS URL in Safari, sign in, then use **Share → Add to Home Screen**.
- Windows: use the updated `Desktop\Productivity\My Tasks\Launch My Tasks.cmd` launcher.

No Pusher dashboard, Microsoft account, Azure service, database, or external account is involved.
