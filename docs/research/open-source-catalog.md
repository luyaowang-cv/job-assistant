# 开源参考目录（P0）

只复用许可证清晰的架构、模板和局部实现；每项接入前需要复核版本、许可证、维护情况与依赖风险。

| Area                | Candidate                      | License / status                                      | Planned use                                                  | Decision                                     |
| ------------------- | ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| SSD workflow        | GitHub Spec Kit                | GitHub-maintained SDD toolkit                         | 参考 Constitution → Specify → Plan → Tasks → Analyze → Implement 流程与质量门 | Adopt concepts; keep project-local artifacts |
| Browser extension   | WXT                            | MIT; framework-agnostic, supports Vue and Manifest V3 | 作为“求职助手”插件脚手架                                     | Candidate for MVP                            |
| Agent orchestration | LangGraph.js official examples | Official reference                                    | 参考状态图、受控工具、持久化和流式输出                       | Adopt patterns; no copy before feature spec  |
| Nuxt UI             | Nuxt 3 + Element Plus          | To be selected after scaffold spec                    | 使用官方模块与局部组件，而非整套未知后台模板                 | Pending                                      |

## Selection rules

1. 优先 MIT、Apache-2.0、BSD；任何其他许可证须在采用前单独确认。

2. 优先官方实现、活跃维护项目和小范围依赖。

3. 复用时记录来源、版本、许可证、引入范围与本地修改。

4. 不复制业务领域代码；只借鉴可替换的基础设施和交互模式。

## Sources

- GitHub Spec Kit documentation: https://github.github.com/spec-kit/reference/agentic-sdd.html

- WXT repository: https://github.com/wxt-dev/wxt

- LangGraph.js documentation: https://langchain-ai.github.io/langgraphjs/