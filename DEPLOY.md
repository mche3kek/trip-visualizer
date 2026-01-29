# Deployment Guide for Japan Travel Visualizer

This guide explains how to deploy the application to a Virtual Private Server (VPS) like DigitalOcean, Linode, AWS EC2, or Hetzner.

## 1. Prerequisites
- A Linux VPS (Ubuntu 20.04/22.04 LTS recommended).
- **Node.js 18+** installed.
- **Git** installed.
- **Nginx** (optional, but recommended for SSL/HTTPS).

## 2. Setting Up Environment Variables (Secrets)
**Never commit `.env` or `.env.local` to Git.**

### ⚠️ Security Warning
Authentication is **ONLY SECURE if you use HTTPS**. If you use HTTP, your password can be seen by anyone on the network. **Follow the Nginx + SSL steps in Section 5.**

### 1. Generate a Secure Password Hash
We do not store plain-text passwords.
1.  On your local machine or server, run the helper script:
    ```bash
    node server/generate-hash.js "MySecurePassword123!"
    ```
2.  Copy the output string (it looks like `a1b2...:c3d4...`).

### 2. Create the .env file
1.  SSH into your VPS.
2.  Navigate to your app directory.
3.  Create the file: `nano .env`
4.  Paste your config:

```bash
# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key_here

# User login
BASIC_AUTH_USER=admin
# Paste the hash generated in Step 1 here:
BASIC_AUTH_HASH=c72e2...<rest of hash>

# Port (default 3000)
PORT=3000
```

## 3. Installation Steps

### 0. Configure Swap (Important for Low-RAM Servers)
If you are using a basic **$4/mo VPS with 512MB or 1GB RAM**, the build process (`npm run build`) might crash due to lack of memory. Run these commands **once** to prevent this:

```bash
# Create a 1GB swap file
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Make it permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/japan-travel-visualizer.git
cd japan-travel-visualizer
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build the Frontend
This compiles the React code into the `dist` folder.
```bash
npm run build
```

## 4. Running the Server with PM2
Use **PM2** to keep your application running in the background and restart it automatically if it crashes or the server reboots.

1.  Install PM2 globally:
    ```bash
    npm install -g pm2
    ```

2.  Start the application:
    ```bash
    # Run the server script
    pm2 start server/index.js --name "trip-visualizer"
    ```

3.  Save the process list to restart on boot:
    ```bash
    pm2 save
    pm2 startup
    # (Follow the command instructions output by pm2 startup)
    ```

## 5. Exposing to the Web (Nginx + SSL)
Ideally, you should run the app behind Nginx to handle HTTPS.

1.  **Install Nginx:**
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  **Configure Nginx:**
    Create a config file: `sudo nano /etc/nginx/sites-available/trip-viz`

    ```nginx
    server {
        listen 80;
        server_name your-domain.com; # OR your IP address

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  **Enable Site:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/trip-viz /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

4.  **SSL (HTTPS) with Certbot (If you have a domain):**
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d your-domain.com
    ```

## Important Security Note
The `VITE_GOOGLE_MAPS_API_KEY` is embedded into the frontend code during the build process. Anyone visiting your site can inspect the page source and see this key.

**To protect your quota and wallet:**
1.  Go to the **Google Cloud Console**.
2.  Navigate to **APIs & Services > Credentials**.
3.  Edit your API Key.
4.  Under **Application restrictions**, choose **HTTP referrers (web sites)**.
5.  Add your VPS IP or Domain (e.g., `http://your-ip-address/*` or `https://your-domain.com/*`).

## 6. Data Persistence & Backups
Your trip data is saved in a simple JSON file on the server:
`server/trip_data.json`

**To backup your data:**
Simply download this file from your VPS occasionally.
```bash
scp -P 22 user@your-vps-ip:/path/to/app/server/trip_data.json ./backup-trip.json
```

**Note:** This file is ignored by Git (`.gitignore`) so that deploying new code updates does NOT overwrite your saved trip data.
