#!/usr/bin/env bash
# ==============================================================================
# PFG Live Support - Automated VPS & Server Setup / Update Script
# Open-Source Real-Time Customer Chat Platform
# ==============================================================================

set -e

# Terminal Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

BANNER="
${PURPLE}====================================================================${NC}
${BLUE}   ____  ___________   __    _             _____                            _   
  / __ \/ ____/ ____/  / /   (_)   _____   / ___/__  ______  ____  ____  _____/ /_ 
 / /_/ / /_  / / __   / /   / / | / / _ \  \__ \/ / / / __ \/ __ \/ __ \/ ___/ __/ 
/ ____/ __/ / /_/ /  / /___/ /| |/ /  __/ ___/ / /_/ / /_/ / /_/ / /_/ / /  / /_   
\/   /_/    \____/  /_____/_/ |___/\___/ /____/\__,_/ .___/ .___/\____/_/   \__/   
                                                   /_/   /_/                        ${NC}
${GREEN}   Production-Ready Real-Time WebSocket Customer Support System${NC}
${PURPLE}====================================================================${NC}
"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. Check Node.js and npm
check_node() {
    log_info "Verifying Node.js and npm runtime..."
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed."
        echo -e "Install Node.js 18+ on Ubuntu/Debian using:\n  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\n  sudo apt-get install -y nodejs"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_warn "Node.js version is $NODE_VERSION. Recommended version is 18 or 20+."
    else
        log_success "Node.js $(node -v) is ready."
    fi

    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed."
        exit 1
    fi
}

# 2. Automated Install & Environment Setup
install_app() {
    echo -e "$BANNER"
    check_node

    log_info "Creating required data & upload directories..."
    mkdir -p data public/uploads

    # Generate .env if not exists
    if [ ! -f .env ]; then
        log_info "Generating production .env configuration..."
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 48)

        cat <<EOF > .env
PORT=3000
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
DEFAULT_SITE_ID=pfg_gateway_default
MAX_FILE_SIZE=10485760
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=200
SOCKET_RATE_LIMIT_MAX=15
SOCKET_RATE_LIMIT_WINDOW_MS=5000
# Optional: Uncomment and configure for PostgreSQL
# DATABASE_URL=postgresql://user:password@localhost:5432/pfg_support
EOF
        log_success "Created .env with secure random JWT secret."
    else
        log_info ".env file already exists. Preserving configuration."
    fi

    log_info "Installing production dependencies via npm..."
    npm install --omit=dev || npm install --force

    log_info "Running system self-test verification..."
    node tests/test-runner.js

    log_success "Installation completed successfully!"
    echo -e "\n${GREEN}To start the server, run:${NC}"
    echo -e "  ./setup.sh start   (or 'npm start')\n"
}

# Helper: Kill any process holding the target port
kill_port_process() {
    local port=$1
    log_info "Checking if port $port is already occupied..."

    # 1. Stop PM2 process if registered
    if command -v pm2 &> /dev/null; then
        pm2 stop "pfg-support" &> /dev/null || true
        pm2 delete "pfg-support" &> /dev/null || true
    fi

    # 2. Linux / macOS: lsof
    if command -v lsof &> /dev/null; then
        local pids
        pids=$(lsof -ti :"$port" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log_warn "Port $port is occupied by PID(s): $pids. Killing old process..."
            echo "$pids" | xargs -r kill -9 2>/dev/null || true
            sleep 1
        fi
    fi

    # 3. Linux: fuser
    if command -v fuser &> /dev/null; then
        fuser -k -n tcp "$port" 2>/dev/null || true
    fi

    # 4. Windows / Git Bash / WSL: netstat.exe & taskkill.exe
    if command -v netstat.exe &> /dev/null && command -v taskkill.exe &> /dev/null; then
        local win_pids
        win_pids=$(netstat.exe -ano | grep ":$port " | awk '{print $5}' | tr -d '\r' | sort -u)
        for wpid in $win_pids; do
            if [ -n "$wpid" ] && [ "$wpid" != "0" ]; then
                log_warn "Port $port is occupied on Windows by PID $wpid. Terminating..."
                taskkill.exe //F //PID "$wpid" &>/dev/null || taskkill.exe /F /PID "$wpid" &>/dev/null || true
            fi
        done
    fi

    # 5. Kill any hanging server/server.js node processes
    pkill -f "server/server.js" 2>/dev/null || true

    sleep 1
    log_success "Port $port is clear and ready."
}

# 3. Start Server with Port Prompt and Process Killer
start_app() {
    local default_port="3000"
    if [ -f .env ]; then
        local env_port
        env_port=$(grep -E '^PORT=' .env 2>/dev/null | cut -d'=' -f2 | tr -d '\r' | tr -d ' ')
        if [ -n "$env_port" ]; then
            default_port="$env_port"
        fi
    fi

    local target_port="$default_port"

    # If running interactively, prompt user for port
    if [ -t 0 ] || [ -n "$PROMPT_PORT" ]; then
        echo -e ""
        echo -ne "${YELLOW}[?] Enter port to run PFG Live Support [Press Enter for default: ${default_port}]: ${NC}"
        read -r user_input_port
        if [ -n "$user_input_port" ]; then
            target_port="$user_input_port"
        fi
    fi

    # Terminate any old process occupying this port
    kill_port_process "$target_port"

    # Persist chosen port into .env
    if [ -f .env ]; then
        if grep -q "^PORT=" .env; then
            sed -i "s/^PORT=.*/PORT=$target_port/" .env 2>/dev/null || sed -i '' "s/^PORT=.*/PORT=$target_port/" .env 2>/dev/null || true
        else
            echo "PORT=$target_port" >> .env
        fi
    fi

    export PORT="$target_port"
    log_info "Launching PFG Live Support on port $target_port..."

    if command -v pm2 &> /dev/null; then
        PORT="$target_port" pm2 start server/server.js --name "pfg-support" --update-env
        log_success "Started with PM2 process manager on port $target_port."
        pm2 logs "pfg-support" --lines 15
    else
        log_info "Starting directly with Node.js on port $target_port..."
        PORT="$target_port" node server/server.js
    fi
}

# 4. Stop Server
stop_app() {
    log_info "Stopping server processes..."
    if command -v pm2 &> /dev/null; then
        pm2 stop "pfg-support" &> /dev/null || true
        log_success "PM2 process stopped."
    fi

    # Read port from .env and kill
    local cur_port="3000"
    if [ -f .env ]; then
        cur_port=$(grep -E '^PORT=' .env 2>/dev/null | cut -d'=' -f2 | tr -d '\r' | tr -d ' ' || echo "3000")
    fi
    kill_port_process "${cur_port:-3000}"
    log_success "All server processes stopped."
}

# 5. Restart Server
restart_app() {
    log_info "Restarting server..."
    stop_app
    sleep 1
    start_app
}

# 6. Automated Update
update_app() {
    echo -e "$BANNER"
    log_info "Updating PFG Live Support to latest version..."

    if [ -d .git ]; then
        log_info "Pulling latest changes from Git repository..."
        git pull || log_warn "Git pull failed or local changes exist. Continuing with install..."
    fi

    log_info "Updating npm packages..."
    npm install --omit=dev || npm install --force

    log_info "Running test suites..."
    node tests/test-runner.js

    if command -v pm2 &> /dev/null && pm2 list | grep -q "pfg-support"; then
        log_info "Reloading PM2 service with zero downtime..."
        pm2 reload "pfg-support"
    else
        log_info "Please restart your server using: ./setup.sh restart"
    fi

    log_success "PFG Live Support has been successfully updated!"
}

# 7. Generate Systemd Daemon Service
generate_service() {
    log_info "Generating Systemd Service unit file..."
    CURRENT_USER=$(whoami)
    NODE_PATH=$(command -v node)

    SERVICE_CONTENT="[Unit]
Description=PFG Live Support Chat Service
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${NODE_PATH} ${PROJECT_DIR}/server/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
"

    echo "$SERVICE_CONTENT" > pfg-support.service
    log_success "Generated pfg-support.service file in current directory."

    echo -e "\nTo install as a system daemon, run as root/sudo:"
    echo -e "  sudo mv ${PROJECT_DIR}/pfg-support.service /etc/systemd/system/"
    echo -e "  sudo systemctl daemon-reload"
    echo -e "  sudo systemctl enable --now pfg-support"
    echo -e "  sudo systemctl status pfg-support\n"
}

# 8. Generate Nginx Reverse Proxy Config
generate_nginx() {
    log_info "Generating production Nginx reverse proxy configuration..."
    cat <<'EOF' > pfg-nginx.conf
# ==============================================================================
# Nginx Reverse Proxy Configuration for PFG Live Support
# Place in /etc/nginx/sites-available/pfg-support and symlink to sites-enabled
# ==============================================================================

server {
    listen 80;
    server_name chat.yourdomain.com; # Replace with your domain

    # Max upload limit matching MAX_FILE_SIZE (10M)
    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket Upgrade Headers (Crucial for Socket.IO WSS)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward headers for real IP detection and TLS
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 300s;
    }
}
EOF
    log_success "Generated pfg-nginx.conf in current directory."
    echo -e "Edit 'chat.yourdomain.com' with your actual domain, then copy to Nginx:\n  sudo cp pfg-nginx.conf /etc/nginx/sites-available/pfg-support\n  sudo ln -s /etc/nginx/sites-available/pfg-support /etc/nginx/sites-enabled/\n  sudo nginx -t && sudo systemctl reload nginx\n"
}

# 9. Main Action Router
case "$1" in
    install|setup)
        install_app
        ;;
    start)
        start_app
        ;;
    stop)
        stop_app
        ;;
    restart)
        restart_app
        ;;
    update)
        update_app
        ;;
    test)
        npm test
        ;;
    service)
        generate_service
        ;;
    nginx)
        generate_nginx
        ;;
    *)
        echo -e "$BANNER"
        echo -e "Usage: ./setup.sh {install|start|stop|restart|update|service|nginx|test}\n"
        echo -e "Commands:"
        echo -e "  ${GREEN}install${NC}   Auto-install dependencies, create .env, and run self-test"
        echo -e "  ${GREEN}start${NC}     Start server (supports PM2 or standard Node.js)"
        echo -e "  ${GREEN}stop${NC}      Stop running server process"
        echo -e "  ${GREEN}restart${NC}   Restart server process"
        echo -e "  ${GREEN}update${NC}    Pull latest git code, update packages & reload"
        echo -e "  ${GREEN}service${NC}   Generate Linux Systemd daemon unit file"
        echo -e "  ${GREEN}nginx${NC}     Generate production Nginx reverse proxy configuration with WSS"
        echo -e "  ${GREEN}test${NC}      Run the automated test runner"
        echo ""
        ;;
esac
