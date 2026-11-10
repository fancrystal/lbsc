# 一键部署

先自行完成代码检查、`git add` 和 `git commit`，再双击 `deploy-production.bat`，或在项目根目录运行：

```powershell
.\deploy\deploy-production.ps1
```

脚本会依次运行自动化测试、推送 `main`、打包已提交代码、上传服务器、在线备份生产数据库及密钥、重启 `lbsc` 并检查内网和公网健康状态。

常用参数：

```powershell
# 只检查提交、分支与部署目标，不写入任何远端状态
.\deploy\deploy-production.ps1 -DryRun

# 确认测试已经自行运行后，跳过测试直接部署
.\deploy\deploy-production.ps1 -SkipTests
```

该脚本只部署代码；不会清理礼包类型、重置数据或修正账目。
