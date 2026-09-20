# 海龟汤中文部署指引（群晖 Docker Compose）

本文说明用户端 H5、Webman 服务端、SaiAdmin 后管的联合部署。本文保存在后管仓库根目录；Compose、网关和生产环境模板来自服务端仓库的 `deploy/synology/`。

命令在群晖 SSH 终端执行，示例部署目录为 `/volume1/docker/turtle-soup`，Docker 路径为 `/usr/local/bin/docker`。域名、账号和存储地址请按实际环境填写。不要提交真实 `production.env`、密钥或数据库备份。

## 1. 部署结构

```text
/volume1/docker/turtle-soup/
├── compose.yaml
├── gateway.conf
├── production.env
├── sources/
│   ├── ui/          # 用户端仓库
│   ├── server/      # 服务端仓库
│   └── admin/       # 后管仓库
└── data/
    ├── mysql/
    ├── redis/
    ├── server-runtime/
    └── uploads/
```

| 服务名    | 容器端口    | 用途                        |
| --------- | ----------- | --------------------------- |
| user-web  | 80          | 用户端 H5                   |
| admin-web | 80          | 后管静态页面                |
| server    | 8787 / 8790 | HTTP API / WebSocket        |
| mysql     | 3306        | 数据库                      |
| redis     | 6379        | 缓存和队列                  |
| gateway   | 8080 / 8081 | 映射到 NAS 的 18080 / 18081 |

容器在 Compose 的 `internal` 网络内通过服务名互访，例如 `user-web:80`、`server:8787`、`mysql:3306`。此处 `internal` 是网络名称；当前模板使用 bridge 网络，并非设置了 `internal: true`。

## 2. 准备代码和配置

首次部署时准备目录并拉取三个仓库：

```bash
mkdir -p /volume1/docker/turtle-soup/sources
cd /volume1/docker/turtle-soup
git clone https://github.com/moyuuuuuuuuuuu/turtle-soup.git sources/ui
git clone https://github.com/moyuuuuuuuuuuu/turtle-soup-server.git sources/server
git clone https://github.com/moyuuuuuuuuuuu/turtle-soup-admin.git sources/admin
cp -n sources/server/deploy/synology/compose.yaml ./compose.yaml
cp -n sources/server/deploy/synology/gateway.conf ./gateway.conf
cp -n sources/server/deploy/synology/production.env.example ./production.env
chmod 600 production.env
```

已有目录时不要重复 clone。生产发布应记录三个仓库的提交 SHA；后续更新使用审核后的分支或提交。`cp -n` 用于避免覆盖已有配置，更新模板时应手工比较差异。

编辑 `production.env`，至少检查：

- `APP_ENV=production`、`APP_DEBUG=false`。
- `APP_URL` 和 `CORS_ALLOWED_ORIGINS` 使用实际 HTTPS 域名。
- 使用模板内 MySQL / Redis 时，`DB_HOST=mysql`、`REDIS_HOST=redis`；填写独立密码。
- JWT、匿名令牌、令牌哈希、邮箱验证码密钥分别设置随机值。
- 填写实际启用的 Coze、邮件、小程序登录和 BOS 参数。
- `SERVER_UID`、`SERVER_GID` 与 NAS 上拥有运行目录的账号一致，可用 `id -u`、`id -g` 查询。

如果使用外部已有 MySQL / Redis，确保服务端加入对应 Docker 网络并填写该网络内可解析的服务名；同时调整 Compose 的依赖关系，不要无意启动第二套数据库。已有 MySQL 数据目录不会因修改初始化环境变量而自动修改数据库密码。

```bash
mkdir -p data/server-runtime data/uploads
# 以下数值须替换为 production.env 中的 SERVER_UID 和 SERVER_GID。
sudo chown 1026:100 data/server-runtime data/uploads
sudo /usr/local/bin/docker compose --env-file production.env config --quiet
```

使用 `config --quiet` 检查，避免将展开后的密码打印到终端。

## 3. 配置用户端对象存储

在 `sources/ui/.env.production` 中设置前端静态资源的公开基址，例如：

```dotenv
VITE_ASSET_BASE_URL=https://assets.example.com/src
```

代码会将 `/static/example.png` 拼接为 `https://assets.example.com/src/static/example.png`，因此 BOS 对象路径必须匹配。基址不包含密钥，资源应允许目标客户端读取；需要跨域读取时配置对应 CORS。

这是编译时变量，修改后必须重新构建用户端镜像。服务端 `production.env` 中的 `BOS_*` 用于服务端存储功能，不会替换已编译的前端资源地址。

H5 Dockerfile 默认使用同源 `/api/v1` 和同源 WebSocket。小程序需要单独构建、配置公网 HTTPS/WSS 地址及平台域名白名单，不由本 H5 容器发布。

## 4. 构建镜像：使用 Compose 和 NAS 代理

无代理且可直接联网时：

```bash
sudo /usr/local/bin/docker compose --env-file production.env build
```

如果代理运行在 NAS 的 `127.0.0.1:7890`，先验证宿主机能访问 npm：

```bash
curl -I --fail --connect-timeout 10 --max-time 20 \
  --proxy http://127.0.0.1:7890 https://registry.npmjs.org/pnpm
```

然后编辑部署目录的 `compose.yaml`，在需要代理的服务现有 `build` 块中增加 `network: host`，其余字段保留。三个服务的示例如下（这是局部配置，不要用它覆盖完整文件）：

```yaml
services:
  user-web:
    build:
      context: ./sources/ui
      network: host
  admin-web:
    build:
      context: ./sources/admin
      network: host
  server:
    build:
      context: ./sources/server
      network: host
```

`build.network` 只影响构建时的 RUN 指令。不要改成运行时的 `network_mode: host`；应用容器继续使用原来的 Compose 网络。

```bash
sudo /usr/local/bin/docker compose --env-file production.env config --quiet
sudo /usr/local/bin/docker compose --env-file production.env build \
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 \
  --build-arg http_proxy=http://127.0.0.1:7890 \
  --build-arg https_proxy=http://127.0.0.1:7890
```

只构建用户端时，在命令最后追加 `user-web`。基础镜像拉取由 Docker 引擎/构建器处理，上述参数主要解决构建步骤内下载依赖的问题。

若 Compose 构建器报 host network entitlement 未允许，需要按该构建器配置授权，或改用下方已经适配群晖 legacy builder 的单镜像命令：

```bash
sudo /usr/local/bin/docker build \
  --network host \
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 \
  --build-arg http_proxy=http://127.0.0.1:7890 \
  --build-arg https_proxy=http://127.0.0.1:7890 \
  -t turtle-soup/user-web:local ./sources/ui
```

末尾 `./sources/ui` 是必需的构建上下文。legacy builder 不支持 `--progress`，不要添加该参数。

## 5. 网关动态解析，避免重建后出现 502

现有模板已使用服务名，但普通静态 upstream 会保留解析结果。容器重建导致 IP 变化时，网关可能仍访问旧地址。

以下动态解析配置要求 Nginx **1.27.3 或更新版本**，本次 NAS 实际版本 1.27.5 支持。部署前可检查版本：

```bash
sudo /usr/local/bin/docker run --rm nginx:1.27-alpine nginx -v
```

在部署目录的 `gateway.conf` 中，将原来的两个 upstream 块替换为以下内容，并新增前端 upstream；原来的 map 和两个 server 块保留：

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
resolver_timeout 5s;

upstream turtle_server_http {
    zone turtle_server_http 64k;
    server server:8787 resolve;
}

upstream turtle_server_ws {
    zone turtle_server_ws 64k;
    server server:8790 resolve;
}

upstream turtle_user_web {
    zone turtle_user_web 64k;
    server user-web:80 resolve;
}

upstream turtle_admin_web {
    zone turtle_admin_web 64k;
    server admin-web:80 resolve;
}
```

接着在两个 `location /` 中分别替换：

```nginx
# 用户端 server（listen 8080）
proxy_pass http://turtle_user_web;

# 后管 server（listen 8081）
proxy_pass http://turtle_admin_web;
```

保留其他请求头和 WebSocket 配置。用户端 `/api/` 的 `proxy_pass http://turtle_server_http;` 保留原路径；后管的 `proxy_pass http://turtle_server_http/;` 去掉 `/api/` 前缀，二者末尾斜杠不要混改。

首次启动会加载新配置。对于已经运行的网关，完成文件修改后执行：

```bash
sudo /usr/local/bin/docker compose --env-file production.env exec -T gateway nginx -t &&
sudo /usr/local/bin/docker compose --env-file production.env exec -T gateway nginx -s reload
```

若宿主机文件已更新，但容器看到的仍是旧文件（单文件挂载被编辑器替换 inode），需要重新创建网关以重新挂载文件：

```bash
sudo /usr/local/bin/docker compose --env-file production.env up -d --no-deps --force-recreate gateway
```

## 6. 校验、初始化与首次启动

构建完成后进行生产配置和目录权限检查，这两条命令不会启动 Webman：

```bash
sudo /usr/local/bin/docker compose --env-file production.env run --rm --no-deps server php bin/check-production-config.php --environment
sudo /usr/local/bin/docker compose --env-file production.env run --rm --no-deps server sh -c 'test -w /app/runtime && test -w /app/public/uploads'
```

数据库初始化、迁移及初始管理员创建应遵循服务端当前版本的说明，在确认目标库和备份、获得明确授权后单独进行。不要对已有生产数据库重复导入或执行清空操作。本文不自动执行迁移。

完成数据库准备后启动全部服务：

```bash
sudo /usr/local/bin/docker compose --env-file production.env up -d --no-build
sudo /usr/local/bin/docker compose --env-file production.env ps -a
curl -I --max-time 10 http://127.0.0.1:18080/
curl -I --max-time 10 http://127.0.0.1:18081/
curl --fail --max-time 10 http://127.0.0.1:18080/api/v1/health
```

检查首页和后管 HTTP 200、API 健康响应、容器状态。再手工验证匿名单人游戏、登录、AI 判断、结束游戏、WebSocket 重连以及后管登录和发布。镜像构建成功不等于业务验收通过。

## 7. Cloudflare Tunnel

先通过 NAS 局域网端口验证，再添加 Tunnel 的公开域名映射：

| cloudflared 运行位置        | 用户端源站                 | 后管源站                   |
| --------------------------- | -------------------------- | -------------------------- |
| NAS 宿主机或 host 网络      | `http://127.0.0.1:18080`   | `http://127.0.0.1:18081`   |
| 与 gateway 相同 Docker 网络 | `http://gateway:8080`      | `http://gateway:8081`      |
| 独立 bridge 网络            | `http://NAS局域网IP:18080` | `http://NAS局域网IP:18081` |

普通 cloudflared 容器的 `127.0.0.1` 指向它自己。使用 `gateway` 名称前，必须让 cloudflared 加入 gateway 所在网络；实际网络名可通过 `docker network ls` 查看。独立网络访问 NAS 地址还需要允许对应防火墙流量。

当前 gateway 提供明文 HTTP 源站，Tunnel 服务类型选 HTTP；公网仍使用 HTTPS。不要将源站协议误设为 HTTPS。

## 8. 日常更新和回滚

更新前记录源码 SHA 和旧镜像 ID，按发布策略备份数据库及上传目录。工作区干净时，可以分别执行 `git -C sources/ui pull --ff-only` 等命令更新代码。重新构建受影响镜像后，仅替换应用服务：

```bash
sudo /usr/local/bin/docker compose --env-file production.env up -d --no-build --no-deps server user-web admin-web
```

这条命令用于已正常运行的环境，不会代替首次启动数据库。若发布包含数据库变更，应先完成经过授权的迁移流程。

如果尚未配置动态解析，更新应用容器后执行第 5 节的 `nginx -t` 和 reload，刷新旧 IP。启用动态解析后，仍需等待服务启动和 DNS 缓存刷新，不能保证重建期间完全无中断。

回滚时使用保留的旧镜像恢复相应服务，并确认其与当前数据库结构兼容。不要用 `docker compose down -v` 进行回滚，也不要删除 `data/`。

## 9. 常见问题

### 安装依赖报 ECONNREFUSED 127.0.0.1:7890

代理已传入，但构建容器访问的是自己的回环地址。检查第 4 节的 `build.network: host`。用户端实际执行的是 `pnpm install --frozen-lockfile`；重试安装或更换 npm 源不能解决代理端口不可达。

### husky 提示 git command not found

`husky - git command not found, skipping install` 表示跳过开发用 Git hooks。若随后显示 prepare Done、安装 Done，不属于构建失败。

### 公网 Bad Gateway

先直连 `http://NAS_IP:18080/`。直连也返回 502 时，优先检查 gateway 到应用容器：

```bash
sudo /usr/local/bin/docker compose --env-file production.env ps -a
sudo /usr/local/bin/docker compose --env-file production.env logs --tail=30 gateway
sudo /usr/local/bin/docker compose --env-file production.env exec -T gateway wget -S -O /dev/null http://user-web:80/
```

如果服务名直连返回 200，但 gateway 日志仍连接另一个旧 IP，按第 5 节重载并配置动态解析。若 NAS 直连正常而公网失败，再检查 Tunnel 的源站协议、端口和 cloudflared 所在网络。

### 对象存储图片没有更新

检查 `VITE_ASSET_BASE_URL`、对象路径、访问权限和 CDN 缓存；修改前端环境配置后重建并替换 `user-web` 容器。只修改服务端环境文件不会更新前端包。

## 参考文档

- [Docker Compose 构建网络](https://docs.docker.com/reference/compose-file/build/#network)
- [Docker 构建代理参数](https://docs.docker.com/engine/cli/proxy/)
- [Docker Compose 服务名与网络](https://docs.docker.com/compose/how-tos/networking/)
- [Nginx upstream 动态解析](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)

本文中的代理网络和动态解析为需要应用的配置步骤；编写本文不会自动修改 NAS 或仓库中的 Compose、gateway 配置。
