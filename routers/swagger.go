// routers 路由层
// swagger.go 接口文档托管
// 文档由 `swag init -g main.go -o docs/swagger` 生成，本服务不引入 gin-swagger 依赖
// （gin-swagger 依赖的 swaggo/files 需要 Go 1.16+，与本项目 Go 1.14 不兼容）
package routers

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// swaggerDocDir swag 生成目录
const swaggerDocDir = "docs/swagger"

// registerSwaggerRoutes 注册文档路由
// /swagger/index.html  Swagger UI 页面（UI 资源走 CDN）
// /swagger/doc.json    OpenAPI 3 描述
// /swagger/swagger.yaml 同一份描述的 YAML 形式
func registerSwaggerRoutes(r *gin.Engine) {
	r.GET("/swagger", func(c *gin.Context) { c.Redirect(http.StatusFound, "/swagger/index.html") })
	r.GET("/swagger/index.html", func(c *gin.Context) {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, swaggerUIHTML)
	})
	r.GET("/swagger/doc.json", func(c *gin.Context) { serveDocFile(c, "swagger.json", "application/json; charset=utf-8") })
	r.GET("/swagger/swagger.json", func(c *gin.Context) { serveDocFile(c, "swagger.json", "application/json; charset=utf-8") })
	r.GET("/swagger/swagger.yaml", func(c *gin.Context) { serveDocFile(c, "swagger.yaml", "text/yaml; charset=utf-8") })
}

// serveDocFile 回写生成目录下的文档文件
func serveDocFile(c *gin.Context, name, contentType string) {
	path := swaggerDocDir + "/" + name
	if _, err := os.Stat(path); err != nil {
		c.String(http.StatusNotFound, "swagger 文档尚未生成，请执行 /Users/fanjunlin/go/bin/swag init -g main.go -o %s", swaggerDocDir)
		return
	}
	c.Header("Content-Type", contentType)
	c.File(path)
}

// swaggerUIHTML 最小 Swagger UI 宿主页面
const swaggerUIHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>FreshMart 接口文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4.19.1/swagger-ui.css">
  <style>body{margin:0}.fallback{padding:24px;font:14px/1.6 sans-serif;color:#666}</style>
</head>
<body>
<div id="swagger-ui"></div>
<div class="fallback" id="fallback" hidden>
  Swagger UI 资源加载失败（需要联网）。可直接查看
  <a href="/swagger/doc.json">/swagger/doc.json</a>。
</div>
<script src="https://unpkg.com/swagger-ui-dist@4.19.1/swagger-ui-bundle.js"
        onerror="document.getElementById('fallback').hidden=false"></script>
<script>
  if (window.SwaggerUIBundle) {
    window.ui = SwaggerUIBundle({ url: '/swagger/doc.json', dom_id: '#swagger-ui' });
  } else {
    document.getElementById('fallback').hidden = false;
  }
</script>
</body>
</html>`
