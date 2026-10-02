# llm-d-lens: Speaker Script

## Slide 1 - llm-d-lens

Hello, everyone. Today I would like to bring up with the idea of **llm-d-lens**, the proposal to make llm-d deployment easier and resource-aware optimal.

The goal is simple: help users move from an application need to a serving stack with a configuration that fits their workload and their real cluster capacity.

This detailed proposal is captured in RFC `llm-d/llm-d#2475`. Here we will give a brief introduction and demo today.

## Slide 2 - What is llm-d-lens? Why we need llm-d-lens?

We have heard feedback from domestic users that llm-d can be difficult to use in practice, especially when deploying a complete serving stack. There are many configuration parameters, many optimization choices, and multiple tools to work through. The harder part is accounting for the real cluster resources. A configuration can look plausible but still not fit the available capacity. Moreover, users are not satisfied with measured benchmark anymore, they want to know the serving's real behavior under realistic traffic.

To solve these painpoints, we propose the llm-d-lens, that brings these pieces into a unified workspace. It combines models, workloads, cluster information, AI-powered recommendations, execution of deploy and benchmark, and trace replay into a direct workflows. The goal is to provide a better llm-d adoption experience.

So to solve configuration complexity, llm-d-lens will provide an AI-powered configuration recommendations that will considering the resource constraints and performance projections, historical anaylisys and multiple factors.

And we will provide a one-click deployment workflow with following benchmarking, monitoring and persist the evidence, to learn from the results over time. or upload to anaylisis in one click.

And the trace replayer to evaluate the real performance besides traditional measured benchmarking.

As well as the basic cluster resource management and monitoring. To instlal the cluster and this tool from scratch. And manage all kinds of resources such as model-cache, GPU memory, RMDA nic

Let's go to the next page for the workflows.

## Slide 3 - From plan to evidence

This slide shows the main workflow.

We begin at the entrypoint, where the user selects the model, cluster, and workload context. From there, the user can follow the normal configuration path, or use the AI-assisted Agentic Recommendation path. For Agentic path, it considers SLO targets and user preferences, BLIS performance projections, resource capacity, and eventually historical performance data. We will leverage AI to score the recsouce-validated candidates and recommand with reasons. This is bounded and secured because users' approval is required before go to deploy stage.

Only need one-click can start the deployment and the following monitoring, evaluations. Here we evaluate the serving stack in two : with **llm-d-benchmark** for measured benchmarking, and with **Trace Replayer** for realistic trace replay.

Both paths produce results and evidence. That evidence can be sent to **llm-d-prism** for sharing and analysis, or to an optional Performance Diagnostic capability. Over time, the evidence can be stored in DB or RAG storage and reused as historical context for better recommendations.

The legend above show gray box is core capability, blue is AI-powered capability, and green is an llm-d built-in project.


At the bottom, the four capability areas summarize the scope: unified resource management, bounded agentic recommendation, deployment with benchmarking and upload, and trace replay with simulation.

## Slide 4 - Demo

Let me now show the user experience in practice.

The key point in this demo is that users should not need to stitch together separate tools manually. They should be able to understand their deployment context, receive a practical configuration recommendation, deploy it, and inspect the resulting performance evidence in one workflow.

## Slide 5 - Q&A

**Question: What is the difference between llm-d-lens and llm-d-planner? Why not contribute directly to llm-d-planner?**

llm-d-planner is primarily a planning component. Given defined inputs and a candidate space, it helps select or rank a deployment plan.

llm-d-lens is the end-to-end adoption workspace around that decision. It brings together workload and cluster context, configuration guidance, deployment, benchmarking, trace replay, evidence collection, and iteration.

So this is not a proposal to replace llm-d-planner. Where its interfaces and scope fit, llm-d-lens should integrate with and contribute upstream to llm-d-planner. But resource management, deployment orchestration, evaluation workflows, and evidence storage sit outside a planner's natural responsibility. Putting all of that into the planner would make its ownership and user experience less clear.

**Question: What is the difference between llm-d-lens and BLIS? Why not use BLIS directly?**

BLIS provides performance projections or inference-simulation signals. It is an important input when we want to understand how a candidate configuration may perform.

llm-d-lens uses that signal in a broader decision workflow. It combines BLIS with the user's targets, actual cluster capacity, deployment constraints, measured benchmark results, and real trace replay. It then helps the user move from recommendation to deployment and validation.

So we would not use BLIS alone because a performance projection is only one part of a deployable decision. A configuration can look promising in simulation but still be infeasible for the current cluster, fail operational constraints, or behave differently under real production traffic. llm-d-lens makes BLIS actionable in that wider, evidence-based workflow.

**Question: Why did you use the llm-d-prism interface?**

We used the Prism interface because it already gives users a familiar place to inspect benchmark data, compare trade-offs, and share results. Reusing that experience lets us validate the Lens workflow quickly and avoids creating a second, disconnected place for performance evidence.

More importantly, it reflects the intended division of responsibilities: Lens guides a decision from cluster and workload context through deployment and evaluation, while Prism remains a strong destination for cross-source analysis, sharing, and review.

**Question: Will llm-d-lens continue to use the llm-d-prism interface?**

The direction is to keep the projects interoperable and reuse Prism where that provides the best user experience, especially for results analysis, reporting, and sharing. We do not need to force every Lens workflow into the Prism UI, though.

Lens needs focused experiences for cluster context, configuration recommendation, deployment, and trace replay. The exact UI boundary should follow the ownership of each capability and community feedback, while preserving a connected user journey.

**Question: What will the release model look like?**

This is still a proposal, so the release model is not final. The practical plan is to deliver it incrementally: first validate the end-to-end workflow with existing llm-d components, then make the stable, reusable capabilities available through a guided installation and documented interfaces.

For capabilities that naturally belong in existing llm-d projects, we should contribute upstream. For the Lens-specific workflow and integration layer, the packaging and release cadence should be decided with the community once the boundaries and operational requirements are clearer.

**Question: What is the relationship between llm-d-lens and GPUStack?**

GPUStack is a broader GPU-cluster management and model-serving platform. It is designed for operating GPU resources, models, inference engines, and production serving services.

llm-d-lens focuses on a different question: given a workload, SLOs, and a target cluster, which llm-d serving-stack configuration should we evaluate or adopt, and what evidence supports that decision? The two can overlap around cluster connection, deployment, and observability, but they are complementary. Lens can use the target environment as decision context, while GPUStack can remain the platform responsible for general GPU and serving operations.

So that's all of the introduction for llm-d-lens: a unified path from deployment intent to evidence-driven iteration.

We are looking for feedback on the workflow, the integration points, and the right first milestones for the community. Thank you, and I am happy to take questions.


## Slide 6 - Backup: Next Steps

Here are three high priority steps we plan to implement soon.

First, add RAG-based historical evidence retrieval, so the Agentic Configuration capability can learn from relevant deployments, evaluations, and simulations results with similarity estimation, and explain its recommendations more clearly.

Second, add role-based access control for platform resources, workflows, and MCP tools.

Third, expand AI assistant and the MCP Playground with wider workflow coverage, stronger contextual help, and better controls for operators.