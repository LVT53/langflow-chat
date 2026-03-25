# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - button "Expand sidebar" [ref=e7] [cursor=pointer]:
        - img [ref=e8]
      - generic [ref=e11]:
        - button "New chat" [ref=e12] [cursor=pointer]:
          - img [ref=e13]
        - button "Search conversations" [ref=e16] [cursor=pointer]:
          - img [ref=e17]
        - button "Open knowledge base" [ref=e20] [cursor=pointer]:
          - img [ref=e21]
      - generic [ref=e26]:
        - button "Open settings" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: A
        - button "Logout" [ref=e29] [cursor=pointer]:
          - img [ref=e30]
    - main [ref=e33]:
      - generic [ref=e37]:
        - heading "What can I help you with?" [level=1] [ref=e39]
        - generic [ref=e41]:
          - textbox "Type a message..." [ref=e42]
          - generic [ref=e43]:
            - generic [ref=e44]:
              - button "Select model" [ref=e45] [cursor=pointer]:
                - generic [ref=e46]: Model 1
                - img [ref=e47]
              - button "Translation disabled" [ref=e49] [cursor=pointer]:
                - generic [ref=e50]: HU
              - button "Attach file" [ref=e51] [cursor=pointer]:
                - img [ref=e52]
            - button "Send message" [disabled] [ref=e55]:
              - img [ref=e56]
  - generic [ref=e59]: Alfy AI
```