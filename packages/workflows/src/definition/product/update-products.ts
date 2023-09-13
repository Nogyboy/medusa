import { ProductTypes, WorkflowTypes } from "@medusajs/types"

import { InputAlias, Workflows } from "../../definitions"
import {
  TransactionStepsDefinition,
  WorkflowManager,
} from "@medusajs/orchestration"
import { exportWorkflow, pipe } from "../../helper"
import { InventoryHandlers, ProductHandlers } from "../../handlers"
import { CreateProductsActions } from "./create-products"
import { updateProductsExtractCreatedVariants } from "../../handlers/middlewares/update-products-extract-created-variants"
import { updateProductsExtractDeletedVariants } from "../../handlers/middlewares/update-products-extract-deleted-variants"
import { useVariantsInventoryItems } from "../../handlers/middlewares/use-variants-inventory-items"
import {
  reshapeAttachSalesChannelsData,
  reshapeDetachSalesChannelsData,
} from "../../handlers/middlewares/update-prodcut-reshape-sales-channes-data"

export enum UpdateProductsActions {
  prepare = "prepare",
  updateProducts = "updateProducts",

  attachSalesChannels = "attachSalesChannels",
  detachSalesChannels = "detachSalesChannels",

  createInventoryItems = "createInventoryItems",
  attachInventoryItems = "attachInventoryItems",
  detachInventoryItems = "detachInventoryItems",
  removeInventoryItems = "removeInventoryItems",
}

export const updateProductsWorkflowSteps: TransactionStepsDefinition = {
  next: {
    action: CreateProductsActions.prepare,
    noCompensation: true,
    next: {
      action: UpdateProductsActions.updateProducts,
      next: [
        {
          action: UpdateProductsActions.attachSalesChannels,
          saveResponse: false,
        },
        {
          action: UpdateProductsActions.detachSalesChannels,
          saveResponse: false,
        },
        {
          // for created variants
          action: UpdateProductsActions.createInventoryItems,
          next: {
            action: UpdateProductsActions.attachInventoryItems,
          },
        },
        {
          // for deleted variants
          action: UpdateProductsActions.detachInventoryItems,
          next: {
            action: UpdateProductsActions.removeInventoryItems,
            noCompensation: true, //  we cannot create as a compensation, but we need to restore which will be done in the handler
          },
        },
      ],
    },
  },
}

const handlers = new Map([
  [
    UpdateProductsActions.prepare,
    {
      invoke: pipe(
        {
          merge: true,
          inputAlias: InputAlias.ProductsInputData,
          invoke: {
            from: InputAlias.ProductsInputData,
          },
        },
        ProductHandlers.updateProductsPrepareData
      ),
    },
  ],
  [
    UpdateProductsActions.updateProducts,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: [
            {
              from: InputAlias.ProductsInputData,
              alias: ProductHandlers.updateProducts.aliases.products,
            },
            {
              from: UpdateProductsActions.prepare,
            },
          ],
        },
        ProductHandlers.updateProducts
      ),
      compensate: pipe(
        {
          merge: true,
          invoke: {
            from: UpdateProductsActions.prepare,
            alias: ProductHandlers.revertUpdateProducts.aliases.preparedData,
          },
        },
        ProductHandlers.revertUpdateProducts
      ),
    },
  ],
  [
    UpdateProductsActions.attachSalesChannels,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: ProductHandlers.revertUpdateProducts.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias:
                ProductHandlers.attachSalesChannelToProducts.aliases.products,
            },
          ],
        },
        reshapeAttachSalesChannelsData,
        ProductHandlers.attachSalesChannelToProducts
      ),
      compensate: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: ProductHandlers.revertUpdateProducts.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
            },
          ],
        },
        reshapeAttachSalesChannelsData,
        ProductHandlers.detachSalesChannelFromProducts
      ),
    },
  ],
  [
    UpdateProductsActions.detachSalesChannels,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: ProductHandlers.revertUpdateProducts.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias:
                ProductHandlers.detachSalesChannelFromProducts.aliases.products,
            },
          ],
        },
        reshapeDetachSalesChannelsData,
        ProductHandlers.detachSalesChannelFromProducts
      ),
      compensate: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: ProductHandlers.revertUpdateProducts.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias:
                ProductHandlers.detachSalesChannelFromProducts.aliases.products,
            },
          ],
        },
        reshapeDetachSalesChannelsData,
        ProductHandlers.attachSalesChannelToProducts
      ),
    },
  ],
  [
    UpdateProductsActions.createInventoryItems,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: updateProductsExtractCreatedVariants.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias: updateProductsExtractCreatedVariants.aliases.products,
            },
          ],
        },
        updateProductsExtractCreatedVariants,
        InventoryHandlers.createInventoryItems
      ),
      compensate: pipe(
        {
          merge: true,
          invoke: {
            from: UpdateProductsActions.createInventoryItems,
            alias:
              InventoryHandlers.removeInventoryItems.aliases.inventoryItems,
          },
        },
        InventoryHandlers.removeInventoryItems
      ),
    },
  ],
  [
    UpdateProductsActions.attachInventoryItems,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: {
            from: UpdateProductsActions.createInventoryItems,
            alias:
              InventoryHandlers.attachInventoryItems.aliases.inventoryItems,
          },
        },
        InventoryHandlers.attachInventoryItems
      ),
      compensate: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: updateProductsExtractCreatedVariants.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias: updateProductsExtractDeletedVariants.aliases.products,
            },
          ],
        },
        updateProductsExtractDeletedVariants,
        useVariantsInventoryItems,
        InventoryHandlers.detachInventoryItems
      ),
    },
  ],
  [
    UpdateProductsActions.detachInventoryItems,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: updateProductsExtractDeletedVariants.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias: updateProductsExtractDeletedVariants.aliases.products,
            },
          ],
        },
        updateProductsExtractDeletedVariants,
        useVariantsInventoryItems,
        InventoryHandlers.detachInventoryItems
      ),
      compensate: pipe(
        {
          merge: true,
          invoke: [
            {
              from: UpdateProductsActions.prepare,
              alias: updateProductsExtractDeletedVariants.aliases.preparedData,
            },
            {
              from: UpdateProductsActions.updateProducts,
              alias: updateProductsExtractDeletedVariants.aliases.products,
            },
          ],
        },
        updateProductsExtractDeletedVariants,
        useVariantsInventoryItems,
        InventoryHandlers.attachInventoryItems
      ),
    },
  ],
  [
    UpdateProductsActions.removeInventoryItems,
    {
      invoke: pipe(
        {
          merge: true,
          invoke: {
            from: UpdateProductsActions.detachInventoryItems,
            alias:
              InventoryHandlers.removeInventoryItems.aliases.inventoryItems,
          },
        },
        InventoryHandlers.removeInventoryItems
      ),
    },
  ],
])

WorkflowManager.register(
  Workflows.UpdateProducts,
  updateProductsWorkflowSteps,
  handlers
)

export const updateProducts = exportWorkflow<
  WorkflowTypes.ProductWorkflow.CreateProductsWorkflowInputDTO,
  ProductTypes.ProductDTO[]
>(Workflows.UpdateProducts, UpdateProductsActions.updateProducts)