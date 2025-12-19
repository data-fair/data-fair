// see syntax examples https://github.com/pegjs/pegjs/tree/master/examples
start
  = Aliases

Aliases
  = before:AliasExpression
    after:(_ "," _ AliasExpression)* {
      const aliasExpressions = [before, ...after.map(a => a[3])].filter(Boolean)
      const aliases = {}
      for (const aliasExpression of aliasExpressions) {
        aliases[aliasExpression.name] = aliasExpression.target
      }      
      return aliases
    }

As = "as"i

AliasExpression
  = target:AliasTarget __ As __ name:FieldName { return { target, name } }
  / target:AliasTarget { return null }

AliasTarget
  = IdentifierName "(" _ ")" { return text() }
  / IdentifierName "(" _ ParamsList _ ")" { return text() }
  / FieldName { return text() }

ParamsList
  = Param (ParamsSep Param)*

ParamsSep
  = _ "," _
  / __

Param
  = Literal
  / FieldName
  / '*'