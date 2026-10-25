# dsh-web-fetch-fakeip-repair

[English](./README.md) | **中文**

一个可逆、profile 级隔离的 DSH 插件，用于修复在 TUN 代理 fake-IP 模式
（Clash/Mihomo、sing-box 等）下无法使用 `web_fetch` 的问题。

> [!WARNING]
> **仅限个人使用且不对外提供服务的 DSH 部署。**请勿将本插件用于共享、
> 多租户或公开可访问的 DSH 实例，也不要用于不可信调用方能够选择
> `web_fetch` URL 的环境。
>
> **预期的 SSRF 取舍：**本插件会故意接受域名的 fake-IP 解析结果。此后，
> DSH 无法验证代理解析并连接的真实目的地。如果代理把某个域名映射到回环
> 地址、私网、链路本地地址或云元数据服务，并允许该连接，那么 `web_fetch`
> 就可能访问该目标。**这会有意使被接受域名在 fake-IP 模式下失去 DSH 的
> 最终目的地 SSRF 防护。**项目所有者仅在上述个人使用范围内接受该后果。
>
> 预期使用场景还假设使用可信的官方 LLM 渠道，但官方渠道并不意味着网页
> 内容或提示词输入一定可信。请确保 TUN/代理可信，尽可能在代理侧阻断回环、
> 私网、链路本地和元数据出口；如果部署变成共享或对外开放，请停用并重新
> 评估本插件。如果无法接受上述风险，也不要启用本插件。

- ✅ 不修改 DSH 的安装源代码。
- ✅ 可作为标准 DSH bundle 安装，并通过 Plugins 页面、profile patch 或
  HMR 在线启用和停用。
- ✅ 仅放宽 `198.18.0.0/15` 范围内的域名 DNS 答案。
- ✅ URL IP 字面量以及直接解析出的私网/回环答案仍保留原来的拒绝行为。
- ✅ 使用 MIT 许可证。

## 问题背景

fake-IP 模式下的 TUN 代理会使用 RFC 2544 基准测试范围
`198.18.0.0/15` 中的地址回答 DNS 查询。DSH 的 `dsh-web-fetch-http`
provider 会故意拒绝所有非公共单播地址，因此每次 `web_fetch` 调用都会失败，
并出现以下错误：

```text
URL hostname "..." resolves to a non-public IP address
```

TUN 本身工作正常：直接执行 `curl https://example.com` 可以连接到
`198.18.0.x` 并成功访问。只有 provider 的 SSRF 防护会拒绝该答案。

## 插件的工作方式

加载时，插件会包装已经注册的 `http` fetch provider 的解析器：

1. 始终先运行原来的严格解析器。
2. 只有当原解析器对某个**域名**抛出 `WEB_BLOCKED_URL`，且该域名的完整
   DNS 答案集都是 `198.18.0.0/15` 中的 fake IPv4 地址时，包装器才会重新
   解析并返回这些答案。
3. URL IP 字面量以及非 fake 答案（包括直接解析出的回环/私网地址）仍保留
   原来的错误。
4. 停用该条目会恢复原解析器。如果 provider 比插件晚注册，插件最多重试
   10 秒。

插件只有一个 ESM 文件：[`index.mjs`](./index.mjs)，并且只导入 Node.js
内置模块。

## 安装

### 标准 bundle 安装（推荐）

本仓库是一个 DSH bundle 包：`package.json` 声明了 `dsh.bundle.patch`，
[`cordis.patch.yml`](./cordis.patch.yml) 会插入插件条目。请按照其他
profile 插件相同的流程安装：

```bash
dsh plugin --profile web add file:/home/elder/projects/dsh-web-fetch-fakeip-repair
```

也可以打开 Web UI 中的 **Plugins → Add plugin**，输入绝对路径
`/home/elder/projects/dsh-web-fetch-fakeip-repair`。

安装器会把 `dsh-web-fetch-fakeip-repair` 添加到 profile，并选择其 bundle
层。随后，该 bundle 会出现在侧边栏的 **Plugins** 页面，你可以分别启用或
停用整个 bundle 及其 `web-fetch-fakeip-repair` 条目。

默认启用 profile HMR（`hmr` 条目开启）时，修改无需重启即可应用。如果
HMR 已关闭，请重启 `dsh web`。

### 手动安装条目（不使用 bundle）

如果希望进行最小化安装且不添加 profile 依赖，可以把条目直接添加到
profile 的 patch 文件中，例如 `~/.dsh/profiles/web/cordis.patch.yml`：

```yaml
- insert:
    - id: web-fetch-fakeip-repair
      name: /home/elder/projects/dsh-web-fetch-fakeip-repair/index.mjs
      config:
        statusFile: /tmp/dsh-web-fetch-fakeip-repair.status
```

`name` 可以是 `index.mjs` 的绝对路径，也可以是相对于 patch 文件的路径
（例如，先把文件复制到 `$DSH_HOME/profiles/<profile>/plugins/`，再使用
`./plugins/dsh-web-fetch-fakeip-repair.mjs`）。

`statusFile` 是可选项。设置后，插件会在处于活动状态时写入一个小型 JSON
状态文件，并在卸载时删除它，可用于检查插件是否已挂载。

手动插入的条目是普通 Loader 条目，而不是 bundle。它会显示在
**Settings → Built-in plugins** 的只读清单中，但不会出现在列出 profile
bundle 及其条目的侧边栏 **Plugins** 页面。

可直接复制的片段位于
[`cordis.patch.example.yml`](./cordis.patch.example.yml)。

### 验证插件是否已启用

```bash
cat /tmp/dsh-web-fetch-fakeip-repair.status
```

启用期间，文件内容类似：

```json
{
  "active": true,
  "patched": true,
  "provider": "http",
  "pid": 12086,
  "at": "2026-10-25T09:48:31.686Z"
}
```

停用该条目后，此文件会被删除。

## 启用与停用

### Bundle 安装

打开侧边栏的 **Plugins** 页面。卡片 **dsh-web-fetch-fakeip-repair**
有一个 bundle 开关，其 `web-fetch-fakeip-repair` 条目也有独立开关：

- bundle 开关会移除或恢复整个 bundle 层；
- 条目开关会向 profile patch 写入 `disabled` 覆盖项。

两种方式都会由 profile HMR 在约一秒内应用。

### 手动安装条目

在 profile patch 的该条目上添加或移除 `disabled: true`：

```yaml
    - id: web-fetch-fakeip-repair
      disabled: true
```

### 卸载

- **Bundle：**在 **Plugins** 页面停用或移除它，或者运行
  `dsh plugin --profile web remove dsh-web-fetch-fakeip-repair`。profile 会
  恢复到之前的组合状态。
- **手动条目：**删除对应的 `- insert:` 块。

两种方式都不会修改 DSH 的安装源代码。

## 适用范围与安全性

使用插件前，请先阅读本文开头的部署范围和 SSRF 警告。

插件只接受 `198.18.0.0/15` 中的 IPv4 DNS 答案，并且这些答案必须来自域名
解析。当以下地址可以直接出现在 fallback DNS 答案集中时，它们仍会被拦截：

- URL IP 字面量，例如 `http://198.18.0.185/`；
- `localhost`，以及 fallback 答案中包含 `127.0.0.0/8` 或 `::1` 的域名；
- `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、链路本地地址以及
  其他所有非公网范围。

这些限制针对的是 DSH 能够看到的 DNS 答案，**而不是被接受的 fake-IP
答案背后隐藏的真实目的地**。代理可以把该域名解析并路由到其允许的任何
目的地，包括私网或其他非公网服务；DSH 无法对这条连接执行正常的最终
目的地检查。

包装器不会放宽原解析器已经接受的答案，也会重新抛出所有不符合“域名
答案全部为 fake IPv4”条件的拒绝。

## 已测试环境

已在 DSH `0.2.1-alpha.2` / `@deepseek-ai/dsh-web-fetch-http`
`0.2.1-alpha.2` 上测试：

- `example.com`、`www.kimi.com`、`api.github.com`：HTTP 200；
- `http://localhost:52080/`：`WEB_BLOCKED_URL`；
- `http://198.18.0.185/`：`WEB_BLOCKED_URL`；
- `http://127.0.0.1:52080/`：`WEB_BLOCKED_URL`；
- 停用插件会恢复严格拒绝；
- provider 延迟注册时可通过重试路径处理。

## 兼容性说明

插件包装的是 provider 实例的 `resolveAddresses` 方法。这是 provider 的
内部字段，不过在编写本插件时检查的 `0.2.1-alpha` 和 `0.2.1-rc` 构建中
一直保持稳定。如果未来的 DSH 版本重命名该字段，插件会记录警告并保持
`web_fetch` 的严格模式，不会导致进程崩溃。届时需要把包装器更新到新字段。

目前只处理 IPv4 fake-IP。如果代理启用了 IPv6 fake-IP 范围，则需要添加
相应的检查。

包装器使用的 Symbol 键故意保留旧的 `dsh.web-fetch-fakeip.*` 拼写。这样，
正在运行的 `web-fetch-fakeip` 条目与新的 `web-fetch-fakeip-repair` 条目
可以在热切换期间共享同一个包装器，移除其中任意一个条目时都能恢复正确
的解析器。

## 许可证

MIT，详见 [LICENSE](./LICENSE)。

Copyright (c) 2026 SIPHON.
