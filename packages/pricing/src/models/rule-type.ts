import { generateEntityId } from "@medusajs/utils"
import {
  BeforeCreate,
  Entity,
  OptionalProps,
  PrimaryKey,
  Property,
} from "@mikro-orm/core"

type OptionalFields = "default_priority"

@Entity()
class RuleType {
  [OptionalProps]?: OptionalFields

  @PrimaryKey({ columnType: "text" })
  id!: string

  @Property({ columnType: "text" })
  name: string

  @Property({ columnType: "text", index: "IDX_rule_type_key_value" })
  key_value: string

  @Property({ columnType: "integer", default: 0 })
  default_priority: number

  @BeforeCreate()
  onCreate() {
    this.id = generateEntityId(this.id, "rt")
  }
}

export default RuleType
