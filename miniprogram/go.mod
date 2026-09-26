// 本目录是独立的小程序工程（Node/Taro），与 Go 后端同仓但不同构建、不同部署。
// 这个 go.mod 只为把子树挡出主模块的 ./... 匹配：npm 依赖里夹带 Go 源码
// （flatted/golang），不隔离会让仓库根的 go build ./... 报与本项目无关的错。
module go-gin/miniprogram

go 1.14
