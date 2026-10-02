# llm-d-lens: Speaker Script

## Slide 1 - llm-d-lens

Hello, everyone. Today I would like to introduce **llm-d-lens**.

The idea is straightforward: make it easier to go from an application requirement to a deployable llm-d serving stack, with a configuration that fits both the workload and the real capacity of the cluster.

This is a community proposal, and the full details are in RFC `llm-d/llm-d#2475`. In the next few minutes, I will walk through the problem, the proposed workflow, and a short demo.

## Slide 2 - What is llm-d-lens?

Today, deploying a complete llm-d serving stack can take a lot of manual work. There are many configuration parameters, many performance trade-offs, and often several tools involved.

The harder part is that a configuration can look good in isolation but still not fit the cluster that is actually available. And before we commit to a deployment, we want to understand how it will behave under realistic traffic.

llm-d-lens brings those steps into one workspace. It starts with llm-d Guides, then brings together models, infrastructure, workload context, configuration recommendation, deployment, benchmarking, and trace replay.

The outcome we want is a better adoption experience: recommendations that are aware of resource constraints and performance projections, a simpler path to deployment and benchmarking, realistic validation through trace replay, and a way to learn from the results over time.

## Slide 3 - From plan to evidence

This is the main workflow.

We begin at the entrypoint, where the user selects the model, cluster, and workload context. From there, the user can follow the normal configuration path, or use the AI-assisted Agentic Recommendation path.

The recommendation is deliberately bounded. It considers targets and preferences, BLIS performance projections, resource capacity, and eventually historical performance data. It produces candidates that can be evaluated and explained, rather than making an opaque decision on the user's behalf.

Once the configuration is ready, we deploy the llm-d serving stack. Then we evaluate it in two complementary ways: **llm-d-benchmark** gives us measured benchmark results, while **Trace Replayer** lets us replay realistic traffic and explore behavior under production-like workloads.

Both paths feed into Results and Evidence. Those results can be uploaded to **llm-d-prism** for analysis and sharing. In the future, they can also support performance diagnostics and be stored in DB or RAG storage as historical evidence for the next recommendation.

The legend shows the boundaries clearly: gray is core capability, blue is AI-powered capability, and green is an llm-d built-in project.

At the bottom, the four capability areas summarize the scope: unified resource management, bounded agentic recommendation, deployment with benchmarking and upload, and trace replay with simulation.

## Slide 4 - Demo

Let me show what this could look like in practice.

The important point is that users should not have to stitch together separate tools by hand. They should be able to define their context, get a practical configuration recommendation, deploy the stack, run validation, and review the resulting evidence in one connected workflow.

As we go through the demo, the question to keep in mind is simple: does this make the next deployment decision easier and more trustworthy?

## Slide 5 - Q&A

That is the proposal for llm-d-lens: a practical path from deployment intent to evidence-driven iteration.

We would especially welcome feedback on the workflow, the integration points, and the right first milestones for the community. Thank you, and I am happy to take questions.

## Slide 6 - Backup: Next Steps

For the next steps, there are three priorities.

First, we want to add RAG-based retrieval for historical evidence. That would let Agentic Recommendation use relevant deployment, evaluation, and simulation results, and explain why a recommendation makes sense.

Second, we need role-based access control for platform resources and workflows, including the permissions used by MCP tools.

Third, we want to expand MCP and the MCP Playground with broader workflow coverage, better context, and stronger controls for operators.
