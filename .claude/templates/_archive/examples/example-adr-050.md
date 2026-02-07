---
adr_number: 'ADR-050'
title: 'Example Architecture Decision - Redis for Distributed Caching'
date: '2026-01-28'
status: 'accepted'
supersedes: ''
superseded_by: ''
stakeholders: ['Engineering Team', 'DevOps', 'Product Manager']
tags: ['caching', 'performance', 'infrastructure']
---

# ADR-050: Example Architecture Decision - Redis for Distributed Caching

**Date**: 2026-01-28
**Status**: accepted

## Context

Our application currently uses in-memory caching within each application server instance. As we scale horizontally with multiple servers, cache coherency becomes a problem. When a user's session is served by different servers, they may see inconsistent data. Additionally, our database is experiencing high load from repeated queries for the same data.

We need a distributed caching solution that:

- Provides consistent data across multiple application servers
- Reduces database load by caching frequently accessed data
- Supports various data structures (strings, lists, sets, hashes)
- Offers high availability and data persistence options

## Decision

We will use Redis as our distributed caching solution with the following configuration:

1. **Redis Cluster**: Deploy a 3-node Redis cluster with automatic sharding using consistent hashing
2. **Cache Strategy**: Implement cache-aside pattern with TTL-based expiration
3. **Data Structures**: Use Redis hashes for user sessions, sets for user permissions, and strings for cached query results
4. **Persistence**: Enable RDB snapshots every 5 minutes and AOF with fsync every second
5. **High Availability**: Configure Redis Sentinel with 3 sentinel nodes for automatic failover

## Consequences

**Positive**:

- **Performance**: 80% reduction in database query load (measured in staging)
- **Scalability**: Application servers can scale horizontally without cache coherency issues
- **Flexibility**: Rich data structure support enables complex caching strategies
- **Reliability**: Sentinel provides automatic failover with minimal downtime

**Negative**:

- **Operational Complexity**: Adds Redis cluster and Sentinel infrastructure to maintain
- **Cost**: Estimated $300/month additional infrastructure cost (3 Redis nodes + 3 Sentinel nodes)
- **Learning Curve**: Team needs training on Redis operations and troubleshooting
- **Memory Management**: Requires careful monitoring of Redis memory usage and eviction policies

**Trade-offs**:

- We accept increased operational complexity in exchange for improved performance and scalability
- We accept additional infrastructure cost as it's offset by reduced database costs and improved user experience

## Alternatives Considered

### 1. Memcached

**Why rejected**: Lacks data persistence and limited data structure support. Cannot recover cache after restart, leading to database load spikes.

### 2. Amazon ElastiCache for Redis

**Why rejected**: Vendor lock-in to AWS and higher cost ($500/month). We prefer self-managed Redis for flexibility across cloud providers.

### 3. Hazelcast

**Why rejected**: JVM-only solution doesn't fit our polyglot architecture (Python, Node.js, Go services). Higher memory footprint.

### 4. Local cache with invalidation messages

**Why rejected**: Requires building custom invalidation logic and message bus. Prone to race conditions and cache inconsistency bugs.

---

**Note**: This is an example ADR demonstrating the template structure. It shows how Context explains the problem, Decision outlines the solution, Consequences covers trade-offs, and Alternatives documents rejected options.
